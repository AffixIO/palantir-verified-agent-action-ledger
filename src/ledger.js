import { createHash, randomUUID } from 'node:crypto';

export function contentDigest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export class InMemoryDecisionStore {
  #rows = [];

  async append(decision) {
    const row = Object.freeze({ ...decision, sequence: this.#rows.length + 1 });
    this.#rows.push(row);
    return row;
  }

  async all() {
    return [...this.#rows];
  }
}

/**
 * Enforces a decision before an action is executed. The verifier is deliberately
 * injected: production users must connect it to their own AffixIO / BoundProof
 * capability endpoint and their Foundry policy model.
 */
export class CapabilityGate {
  constructor({ verifier, decisionStore, now = () => new Date() }) {
    this.verifier = verifier;
    this.decisionStore = decisionStore;
    this.now = now;
  }

  async run(request, execute) {
    validateRequest(request);
    const receivedAt = this.now().toISOString();
    const digest = contentDigest(request.input ?? null);
    let verification;

    try {
      verification = await this.verifier.check(request);
    } catch (error) {
      verification = { allowed: false, reason: 'verification_unavailable', error: error.message };
    }

    const decision = await this.decisionStore.append({
      decisionId: randomUUID(),
      receivedAt,
      agentId: request.agentId,
      action: request.action,
      resource: request.resource,
      policyVersion: request.policyVersion,
      capabilityId: request.capabilityId,
      proofReference: verification.proofReference ?? null,
      delegationChain: verification.delegationChain ?? [],
      revocationState: verification.revocationState ?? 'unknown',
      contentDigest: digest,
      allowed: verification.allowed === true,
      reason: verification.reason ?? (verification.allowed ? 'allowed' : 'denied')
    });

    if (!decision.allowed) {
      return { status: 'denied', decision };
    }

    try {
      const result = await execute();
      return { status: 'executed', decision, result };
    } catch (error) {
      await this.decisionStore.append({
        ...decision,
        decisionId: randomUUID(),
        receivedAt: this.now().toISOString(),
        event: 'execution_failed',
        allowed: true,
        reason: 'execution_failed',
        executionError: error.message
      });
      throw error;
    }
  }
}

function validateRequest(request) {
  for (const key of ['agentId', 'action', 'resource', 'policyVersion', 'capabilityId']) {
    if (!request?.[key] || typeof request[key] !== 'string') {
      throw new TypeError(`${key} must be a non-empty string`);
    }
  }
}
