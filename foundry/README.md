# Foundry packaging map

Use this map when converting the reference implementation into a Foundry package:

| Reference component | Foundry implementation |
| --- | --- |
| `CapabilityGate.run` | Function or Compute Module endpoint invoked before an Ontology Action |
| `createCapabilityVerifier` | HTTPS-only adapter to the organisation-approved capability service |
| `runProtectedFoundryAction` | Thin action-handler boundary that prevents execution after any deny |
| `InMemoryDecisionStore` | Append-only `AgentDecision` backing dataset and Ontology object type |
| `execute` | A narrowly scoped Foundry Action or Function |

Suggested `AgentDecision` properties: pseudonymous agent ID, requested action, resource reference, policy version, capability ID, proof reference, revocation state, expiry, decision, reason, content digest, delegation-chain digest, previous-record digest, record digest, and timestamp.

## Request contract

The wrapper receives a narrow request: `agentId`, `action`, `resource`, `policyVersion`, `capabilityId`, and an optional host-local `input`. Only the SHA-256 digest of `input` reaches the verifier.

For an allow result, the verifier must return `allowed: true`, `not_revoked`, a future `expiresAt`, a proof reference, and a scope that exactly echoes agent ID, action, resource and capability ID. Any omission, mismatch, timeout or transport failure denies the action.

This repository intentionally does not include a Palantir SDK dependency, a tenant endpoint, credentials or production Ontology data. The `foundry/action-wrapper.js` boundary is designed to be called from the organisation's chosen Foundry Function or action handler.

Do not package live credentials, private keys, personal information, or production proof material. The package must be configured with organisation-specific endpoints and secrets after installation.
