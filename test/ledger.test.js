import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityVerifier } from '../src/capability-verifier.js';
import { CapabilityGate, InMemoryDecisionStore } from '../src/ledger.js';
import { runProtectedFoundryAction } from '../foundry/action-wrapper.js';

const now = () => new Date('2026-10-28T12:00:00.000Z');
const request = {
  agentId: 'agent:ops-7',
  action: 'work-order.close',
  resource: 'work-order/42',
  policyVersion: '2026-10-28',
  capabilityId: 'cap_42',
  input: { outcome: 'complete', internalNote: 'do not persist' },
};

function allowedResponse(overrides = {}) {
  return {
    allowed: true,
    reason: 'capability_valid',
    proofReference: 'proof_123',
    revocationState: 'not_revoked',
    expiresAt: '2026-10-28T13:00:00.000Z',
    scope: { agentId: request.agentId, action: request.action, resource: request.resource, capabilityId: request.capabilityId },
    delegationChain: [{ grant: 'operator-to-agent' }],
    ...overrides,
  };
}

test('never executes an action when verification denies it', async () => {
  const store = new InMemoryDecisionStore();
  const gate = new CapabilityGate({ verifier: { check: async () => ({ allowed: false, reason: 'capability_revoked', revocationState: 'revoked' }) }, decisionStore: store, now });
  let invoked = false;
  const response = await gate.run(request, async () => { invoked = true; });
  assert.equal(response.status, 'denied');
  assert.equal(invoked, false);
  assert.equal(response.decision.reason, 'capability_revoked');
  assert.equal(response.decision.revocationState, 'revoked');
  assert.match(response.decision.contentDigest, /^[a-f0-9]{64}$/);
});

test('fails closed when the verifier is unavailable', async () => {
  const store = new InMemoryDecisionStore();
  const gate = new CapabilityGate({ verifier: { check: async () => { throw new Error('network unreachable'); } }, decisionStore: store, now });
  const response = await gate.run(request, async () => { throw new Error('must not run'); });
  assert.equal(response.status, 'denied');
  assert.equal(response.decision.reason, 'verification_unavailable');
});

test('records the decision before a correctly scoped allowed action runs', async () => {
  const store = new InMemoryDecisionStore();
  const gate = new CapabilityGate({ verifier: { check: async () => allowedResponse() }, decisionStore: store, now });
  const response = await gate.run(request, async () => ({ updated: true }));
  assert.equal(response.status, 'executed');
  assert.deepEqual(response.result, { updated: true });
  assert.equal((await store.all()).length, 1);
  assert.equal(response.decision.proofReference, 'proof_123');
  assert.equal(JSON.stringify(response.decision).includes('do not persist'), false);
  assert.equal(JSON.stringify(response.decision).includes('operator-to-agent'), false);
});

test('denies an expired capability even when the remote service says allowed', async () => {
  const store = new InMemoryDecisionStore();
  const gate = new CapabilityGate({ verifier: { check: async () => allowedResponse({ expiresAt: '2026-10-28T11:59:59.000Z' }) }, decisionStore: store, now });
  const response = await gate.run(request, async () => { throw new Error('must not run'); });
  assert.equal(response.status, 'denied');
  assert.equal(response.decision.reason, 'capability_expired');
});

test('denies a mismatched resource scope even when the remote service says allowed', async () => {
  const store = new InMemoryDecisionStore();
  const gate = new CapabilityGate({ verifier: { check: async () => allowedResponse({ scope: { agentId: request.agentId, action: request.action, resource: 'work-order/other', capabilityId: request.capabilityId } }) }, decisionStore: store, now });
  const response = await gate.run(request, async () => { throw new Error('must not run'); });
  assert.equal(response.status, 'denied');
  assert.equal(response.decision.reason, 'verification_scope_mismatch:resource');
});

test('hash-chains decision records and uses only a digest for execution failures', async () => {
  const store = new InMemoryDecisionStore();
  const gate = new CapabilityGate({ verifier: { check: async () => allowedResponse() }, decisionStore: store, now });
  await assert.rejects(() => gate.run(request, async () => { throw new Error('sensitive operational detail'); }), /sensitive operational detail/);
  const rows = await store.all();
  assert.equal(rows.length, 2);
  assert.equal(rows[1].previousRecordDigest, rows[0].recordDigest);
  assert.match(rows[1].executionErrorDigest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(rows[1]).includes('sensitive operational detail'), false);
});

test('sends a digest-only request through the capability transport adapter', async () => {
  let sent;
  const verifier = createCapabilityVerifier({
    endpoint: 'https://capability.example.test/check',
    getAccessToken: async () => 'test-token',
    fetchImpl: async (_url, options) => {
      sent = options;
      return new Response(JSON.stringify(allowedResponse()), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const store = new InMemoryDecisionStore();
  const response = await runProtectedFoundryAction({ verifier, decisionStore: store, request, executeFoundryAction: async () => ({ closed: true }), now });
  assert.equal(response.status, 'executed');
  const body = JSON.parse(sent.body);
  assert.match(body.contentDigest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(body).includes('do not persist'), false);
  assert.equal(sent.headers.authorization, 'Bearer test-token');
});

test('rejects non-HTTPS capability endpoints', () => {
  assert.throws(() => createCapabilityVerifier({ endpoint: 'http://example.test/check', getAccessToken: async () => 'x' }), /https/);
});
