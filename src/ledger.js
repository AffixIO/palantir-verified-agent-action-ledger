import { createHash, randomUUID } from 'node:crypto';

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function contentDigest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

export class InMemoryDecisionStore {
  #rows = [];

  async append(decision) {
    const previousRecordDigest = this.#rows.at(-1)?.recordDigest ?? null;
    const recordDigest = contentDigest({ ...decision, previousRecordDigest });
    const row = Object.freeze({ ...decision, previousRecordDigest, recordDigest, sequence: this.#rows.length + 1 });
    this.#rows.push(row);
    return row;
  }

  async all() {
    return [...this.#rows];
  }
}

function verificationRequest(request, contentDigestValue) {
  return {
    agentId: request.agentId,
    action: request.action,
    resource: request.resource,
    policyVersion: request.policyVersion,
    capabilityId: request.capabilityId,
    contentDigest: contentDigestValue,
  };
}

function denial(reason, extra = {}) {
  return { allowed: false, reason, revocationState: extra.revocationState ?? 'unknown', proofReference: extra.proofReference ?? null, delegationChainDigest: contentDigest(extra.delegationChain ?? []) };
}

function verifyResponse(response, request, now) {
  if (!response || typeof response !== 'object' || response.allowed !== true) return denial(response?.reason ?? 'verification_denied', response ?? {});
  if (response.revocationState !== 'not_revoked') return denial('capability_not_active', response);
  if (!response.proofReference || typeof response.proofReference !== 'string') return denial('proof_reference_missing', response);
  if (!response.expiresAt || Number.isNaN(Date.parse(response.expiresAt)) || Date.parse(response.expiresAt) <= now.getTime()) return denial('capability_expired', response);
  const scope = response.scope;
  if (!scope || typeof scope !== 'object') return denial('verification_scope_missing', response);
  for (const key of ['agentId', 'action', 'resource', 'capabilityId']) {
    if (scope[key] !== request[key]) return denial(`verification_scope_mismatch:${key}`, response);
  }
  return {
    allowed: true,
    reason: response.reason ?? 'allowed',
    revocationState: response.revocationState,
    proofReference: response.proofReference,
    expiresAt: response.expiresAt,
    delegationChainDigest: contentDigest(response.delegationChain ?? []),
  };
}

/**
 * Enforces a verified decision before an action is executed. The verifier is
 * injected. Production callers must supply an approved capability service.
 */
export class CapabilityGate {
  constructor({ verifier, decisionStore, now = () => new Date() }) {
    this.verifier = verifier;
    this.decisionStore = decisionStore;
    this.now = now;
  }

  async run(request, execute) {
    validateRequest(request);
    if (typeof execute !== 'function') throw new TypeError('execute must be a function');
    const receivedAt = this.now().toISOString();
    const digest = contentDigest(request.input ?? null);
    let rawVerification;
    try {
      // The verifier receives no raw action input.
      rawVerification = await this.verifier.check(verificationRequest(request, digest));
    } catch {
      rawVerification = denial('verification_unavailable');
    }
    const verification = verifyResponse(rawVerification, request, this.now());
    const decision = await this.decisionStore.append({
      decisionId: randomUUID(),
      receivedAt,
      agentId: request.agentId,
      action: request.action,
      resource: request.resource,
      policyVersion: request.policyVersion,
      capabilityId: request.capabilityId,
      proofReference: verification.proofReference,
      delegationChainDigest: verification.delegationChainDigest,
      revocationState: verification.revocationState,
      expiresAt: verification.expiresAt ?? null,
      contentDigest: digest,
      allowed: verification.allowed,
      reason: verification.reason,
    });
    if (!decision.allowed) return { status: 'denied', decision };
    try {
      const result = await execute();
      return { status: 'executed', decision, result };
    } catch (error) {
      await this.decisionStore.append({
        ...decision,
        decisionId: randomUUID(),
        receivedAt: this.now().toISOString(),
        event: 'execution_failed',
        reason: 'execution_failed',
        executionErrorDigest: contentDigest(String(error?.message ?? 'execution_error')),
      });
      throw error;
    }
  }
}

function validateRequest(request) {
  for (const key of ['agentId', 'action', 'resource', 'policyVersion', 'capabilityId']) {
    if (!request?.[key] || typeof request[key] !== 'string') throw new TypeError(`${key} must be a non-empty string`);
  }
}
