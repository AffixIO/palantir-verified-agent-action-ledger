import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityGate, InMemoryDecisionStore } from '../src/ledger.js';

const request = {
  agentId: 'agent:ops-7',
  action: 'work-order.close',
  resource: 'work-order/42',
  policyVersion: '2026-10-26',
  capabilityId: 'cap_42',
  input: { outcome: 'complete' }
};

test('never executes an action when verification denies it', async () => {
  const store = new InMemoryDecisionStore();
  const gate = new CapabilityGate({
    verifier: { check: async () => ({ allowed: false, reason: 'capability_revoked', revocationState: 'revoked' }) },
    decisionStore: store
  });
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
  const gate = new CapabilityGate({
    verifier: { check: async () => { throw new Error('network unreachable'); } },
    decisionStore: store
  });
  const response = await gate.run(request, async () => { throw new Error('must not run'); });

  assert.equal(response.status, 'denied');
  assert.equal(response.decision.reason, 'verification_unavailable');
});

test('records decision before running an allowed action', async () => {
  const store = new InMemoryDecisionStore();
  const gate = new CapabilityGate({
    verifier: { check: async () => ({ allowed: true, proofReference: 'proof_123', revocationState: 'not_revoked' }) },
    decisionStore: store
  });
  const response = await gate.run(request, async () => ({ updated: true }));

  assert.equal(response.status, 'executed');
  assert.deepEqual(response.result, { updated: true });
  assert.equal((await store.all()).length, 1);
  assert.equal(response.decision.proofReference, 'proof_123');
});
