# CHG-0015: Fix the PRD pointers and compute the source hash

**Severity**: S2 (New capability) | **Priority**: P3 | **Version**: 1.0.0 → 1.1.0
**Date**: 2026-11-02 | **Author**: platform-owner | **Decides**: none

## What changed

The platform's pointer for the user app says `canonical_repo: safaaisaathi/userapp` and `canonical_path: docs/PRD-1-user-app.md`. The repository is now `safaaisaathi/userapp`, renamed from `user-app` on 2026-11-02, and the real file is `PRD-1-user-app (1).md` at the repository root, not under `docs/`. The admin panel's pointer at `01-prds/PRD-3-admin-panel.md` names `docs/PRD-3-admin-panel.md`, and that file does not exist. The driver's pointer says `docs/PRD-2-driver-app.md`, and that one is correct. Every pointer in the platform has `sourceHash: sha256:pending`, so the drift detection has never worked.

## Why

A pointer is only useful if it resolves. Two of the three pointers name a location that does not exist, so a reader who follows one gets a 404. The `sourceHash: sha256:pending` is worse than a broken link, because it is silent: the drift check compares a stored hash against the file, and a stored `pending` can never match. So a PRD can describe a field that was renamed months ago and nothing catches it.

## What breaks

| App | What breaks |
|---|---|
| userapp | Nothing at runtime. A reader following the platform's pointer lands on a path that does not exist, because the file is at the root and named `PRD-1-user-app (1).md` |
| adminpanel | Nothing at runtime. The pointer names `docs/PRD-3-admin-panel.md`, and there is no such file, so the panel has no PRD at all |
| driverapp | Nothing. Its pointer, `docs/PRD-2-driver-app.md`, is correct |

**The symptom is a 404 and a false green.** A broken pointer is visible the moment someone clicks it. The `pending` hash is not visible at all: the drift check passes and the PRD is still wrong.

## Who is affected

| App | Affected? | What they must do | Blocked release? |
|---|---|---|---|
| driverapp | YES | Confirm `docs/PRD-2-driver-app.md` matches the pointer | No |
| userapp | YES | Move `PRD-1-user-app (1).md` to `docs/PRD-1-user-app.md` | No, this is scheduled; the deadline is null |
| adminpanel | YES | Write `docs/PRD-3-admin-panel.md` | No, this is scheduled; the deadline is null |

## Migration steps

1. userapp: move 'PRD-1-user-app (1).md' to 'docs/PRD-1-user-app.md'. The filename with a space and a (1) is a download artefact
2. adminpanel: write 'docs/PRD-3-admin-panel.md'. The platform points at it and it does not exist
3. driverapp: confirm the path docs/PRD-2-driver-app.md matches the pointer
4. The platform owner then computes the sha256 of each PRD and writes it into sourceHash. It says 'pending' today, so drift detection does not work

**The order that works**: fix the file paths first, then compute the hashes. The hash can only be written once the file is at the path the pointer names.

## Rollback

**Revert the pointer edits.** The `sourceHash` goes back to `pending` and the drift check stops working again.

**What breaks if you do**: a stale PRD passes CI again. The pointer edits themselves are safe to revert; the hash is the part that carries the value.

## Files changed

| File | What changed in it |
|---|---|
| `01-prds/PRD-1-user-app.md` | `canonical_path` and `sourceHash` corrected |
| `01-prds/PRD-2-driver-app.md` | `sourceHash` computed; the path was already right |
| `01-prds/PRD-3-admin-panel.md` | `sourceHash` computed once the file exists |
| `VERSION` | 1.0.0 → 1.1.0 |
| `06-changes/manifest.json` | The `CHG-0015` entry |

## See also

- [The user app PRD pointer](../01-prds/PRD-1-user-app.md)
- [The driver app PRD pointer](../01-prds/PRD-2-driver-app.md)
- [The admin panel PRD pointer](../01-prds/PRD-3-admin-panel.md)
- [Making a contract change](../07-guides/making-a-contract-change.md)
