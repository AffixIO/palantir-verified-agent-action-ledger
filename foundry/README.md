# Foundry packaging map

Use this map when converting the reference implementation into a Foundry package:

| Reference component | Foundry implementation |
| --- | --- |
| `CapabilityGate.run` | Function or Compute Module endpoint invoked before an Ontology Action |
| `verifier.check` | Adapter to the organisation's AffixIO / BoundProof capability-check endpoint |
| `InMemoryDecisionStore` | Append-only `AgentDecision` backing dataset and Ontology object type |
| `execute` | A narrowly scoped Foundry Action or Function |

Suggested `AgentDecision` properties: pseudonymous agent ID, requested action, resource reference, policy version, capability ID, proof reference, revocation state, decision, reason, content digest, timestamp, and delegation-chain digest.

Do not package live credentials, private keys, personal information, or production proof material. The package must be configured with organisation-specific endpoints and secrets after installation.
