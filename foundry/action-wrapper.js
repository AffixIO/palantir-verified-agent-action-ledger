import { CapabilityGate } from '../src/ledger.js';

/**
 * Template boundary for a narrow Foundry Function or Ontology Action handler.
 * `executeFoundryAction` runs only after the capability gate allows it.
 */
export async function runProtectedFoundryAction({ verifier, decisionStore, request, executeFoundryAction, now }) {
  const gate = new CapabilityGate({ verifier, decisionStore, now });
  return gate.run(request, executeFoundryAction);
}
