import { CapabilityGate, InMemoryDecisionStore } from './ledger.js';

const store = new InMemoryDecisionStore();
const verifier = {
  async check(request) {
    return {
      allowed: request.action === 'case.note.create',
      reason: request.action === 'case.note.create' ? 'capability_valid' : 'scope_not_granted',
      proofReference: 'demo-proof-reference',
      revocationState: 'not_revoked',
      delegationChain: []
    };
  }
};

const gate = new CapabilityGate({ verifier, decisionStore: store });
const response = await gate.run({
  agentId: 'agent:example-operations',
  action: 'case.note.create',
  resource: 'case/INC-1042',
  policyVersion: '2026-10-26',
  capabilityId: 'cap_example',
  input: { note: 'Agent-generated triage note.' }
}, async () => ({ created: true }));

console.log(JSON.stringify(response, null, 2));
