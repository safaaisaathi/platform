---
id: adr-0006-device-id-is-a-custom-claim
title: deviceId is a custom claim
status: accepted        # proposed | accepted | rejected | superseded
owner: platform-owner
updated: 2026-11-01
audience: harness
deciders: [platform-owner]
consulted: [userapp-team, driverapp-team, adminpanel-team]
informed: [office]
supersedes: null
supersededBy: null
see_also:
  - ../02-contracts/claims.json
  - ../02-contracts/callables.json
---

# deviceId is a custom claim

## Context

The user app is anonymous by design, with no signup. A citizen files a complaint and can see their own complaints. The `deviceId` is a locally-generated UUID on the phone. The rules need something to scope "my complaints" against.

One question forces the design: can a citizen see their complaint after a reinstall? A reinstall generates a new UUID. Whatever scopes the complaint read is gone.

## Decision

Same install only. The `deviceId` MUST be in a custom claim on the session, set by the `bootstrapUserSession` callable. It is NEVER a client parameter and NEVER a query parameter.

| Rule | Why |
|---|---|
| The claim is the only trusted copy | It is minted server-side and bound into the token. The rules read `request.auth.token.deviceId` and nothing else |
| Never a client parameter | A client parameter is forgeable. If the complaint read were `where deviceId == <param>`, any caller could pass any id and read any citizen's complaints |
| Never a query parameter | Same forgery, dressed as a URL argument |
| The callable, not the client, resolves scope | `bootstrapUserSession` takes the deviceId and the wardId, resolves the ward's route server-side, and mints `deviceId` and `routeId` together. The client cannot choose its own `routeId`, or it could read any route's trips |

## Consequences

### Good

| Consequence | Why it matters |
|---|---|
| The client cannot CHANGE its scope after sign-in | The scope is baked into the token. Re-calling with a different id mints a fresh session, it does not widen the current one |
| Zero friction is preserved | No signup, no OTP, no consent screen. The anonymous app stays anonymous |
| One mechanism for all three apps | The driver and the admin mint claims the same way. One mental model, one probe suite |

### Bad

| Cost | Why it is accepted |
|---|---|
| A reinstall loses the complaint history on the phone | The complaint still exists and the office still sees it. The citizen just cannot list it from the new install. This limitation MUST be in the handover notes so nobody debugs it as a bug |
| The claim does not prove the device is genuine | And it does not need to. Its job is to make the scope unchangeable after sign-in, not to certify hardware. A caller that copies another install's id could bootstrap with it, which is accepted for an anonymous, zero-friction app where the id is a random UUID, not a guessable value |
| History is not portable across devices | A citizen who switches phones starts a fresh complaint list. If portability becomes a product need, that is a new ADR |

## Why not a phone number or OTP

| What OTP adds | What it changes |
|---|---|
| An SMS flow | Cost, delivery delay, a provider dependency |
| A verification collection | New data to protect, new rules to write |
| A rate limit | A new abuse surface to tune |
| A consent screen | New UI, and a consent conversation |

The deeper cost: it turns an anonymous app into an account app. That is a product change, not a backend change. It belongs to a product decision, not to this contract. If the office ever wants citizens to have accounts, that decision supersedes this ADR through the normal process.

## References

| What | Where |
|---|---|
| The `deviceId` claim definition and the Q6 note | `../02-contracts/claims.json`, `deviceId` |
| The `bootstrapUserSession` contract, including the deviceId trust note | `../02-contracts/callables.json`, `bootstrapUserSession` |
| The reason codes the bootstrap can return | `../02-contracts/errors.json` |
| The claims-over-parameters rule this applies | `../02-contracts/claims.json`, `x-minting.never` |
| The other two sessions in the same shape | ADR 0004 (driver), ADR 0003 (admin) in `./index.md` |
