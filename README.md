# Verified Agent Action Ledger for Palantir AIP

An open reference implementation for making agent actions accountable before they reach a sensitive system.

It demonstrates a small, fail-closed control plane:

1. An agent requests a specific action against a specific resource.
2. A capability verifier decides whether that action is currently authorised.
3. The decision is recorded before the action is run.
4. Only an explicit allow result reaches the action executor.
5. The record retains a content digest rather than the raw input by default.

This is intended as a template for a Foundry package, not as a claim that it validates any particular production identity system. The verifier is an injected adapter. Connect it to the deployed AffixIO / BoundProof capability-check service only after configuring your policies, credentials, retention rules, and review process.

## Why this exists

Agent systems need more than an audit log after the fact. High-impact actions should have an authorisation decision, a policy version, a revocation state, and an attributable pseudonymous actor before they execute.

The example fits operational workflows such as creating a case note, proposing a work-order change, or sending an external notification. It intentionally does not grant broad agent permissions, settle payments, or make claims about a verifier that has not been connected.

## Run locally

Requires Node.js 20 or newer.

```bash
npm test
npm run demo
```

## Foundry / AIP deployment

1. Create a narrow Ontology Action or Function for the operation to protect.
2. Implement a `verifier.check(request)` adapter that calls your approved capability service.
3. Persist `AgentDecision` records in a governed backing dataset and expose only the fields appropriate for the relevant reviewers.
4. Put the `CapabilityGate` in front of the action. A timeout, malformed verification response, or revoked capability must deny execution.
5. Package the application, backing datasets, functions, and source using Foundry DevOps. Exclude credentials, private keys, personal data, and private proof material.

See [foundry/README.md](foundry/README.md) for the component map.

## Security behaviour

- Fails closed when verification cannot be reached.
- Records allow/deny, policy version, proof reference, revocation state, action, resource, and SHA-256 content digest.
- Does not persist raw action input by default.
- Does not treat a proof reference as an authorisation result by itself.
- Requires the production adapter to check expiry, scope, revocation, and any delegation constraints.

## Status

Local reference implementation tested. Foundry packaging and live AIP deployment require a Palantir AIP Developer account and a target Foundry environment. No Palantir credentials, AffixIO secrets, or production data are included.
