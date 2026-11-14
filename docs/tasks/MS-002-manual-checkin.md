# MS-002 — Idempotent manual check-in

| Field | Value |
| --- | --- |
| Status | In progress — specification checkpoint |
| Branch | `feat/MS-002-manual-checkin` |
| Owner | Abinash Ghimire; Codex implements within the active request |
| Dependencies | MS-001 locally accepted and squash-merged as `c616a00` |
| Task path | `docs/tasks/MS-002-manual-checkin.md` |
| Intended squash commit | `feat(MS-002): record idempotent manual check-ins` |
| PR | Not created; no publication authorized |

## Problem and outcome

The kiosk now starts a private session but Check in is disabled. A visitor should be able to enter a name and NetID and get an honest confirmation only after attendance storage commits the visit. Retrying an uncertain request must not create a second visit. This is self-reported attendance, not university identity verification, authorization to operate equipment, door access or occupancy tracking.

## Scope

Add validated manual check-in, a service-owned append-only attendance migration, transactional idempotency, UTC timestamps, bounded retention, a protected gateway route and an accessible form with transient state. Check-in must work when knowledge/Ollama are unavailable. All acceptance data is synthetic and created in temporary fixtures.

Exclude history/export (MS-005), photos/consent (MS-006), face recognition, document ingestion/answers, voice, LAN exposure, production data import and institutional policy approval. No browser queue or persistent visitor identity. Do not run migrations against the operator's existing databases during development.

## Read before coding and baseline

Read [AGENTS.md](../../AGENTS.md), [architecture](../architecture/ARCHITECTURE.md), [setup](../LOCAL_SETUP.md), [Git workflow](../GIT_WORKFLOW.md), [MS-001](MS-001-access-controls.md), the task template, and attendance/gateway/UI/contracts/HTTP helper/fixture source.

- Branch created from local main `c616a00` on 13 November 2026. MS-001 has 61 passing automated checks, lint/typechecked build and visually reviewed desktop/mobile Chromium screenshots. Its 14 grouped commits remain on `feat/MS-001-access-controls`; its final squash tree was checked for exact equality and no runtime/secret/dependency outputs.
- `origin/main` was fetched during MS-001 and remains `ccf3c34`; local main has the separate MS-000 and MS-001 commits. No push or remote merge occurred.
- Preserve the initial unrelated staging (31,185 additions including dependencies/runtime/config and 13 PDF moves/deletions). Never use blanket add/commit or autostash. Continue using exact named-path commits and the recorded semantic index audit. The operator may edit `.env`/dependency state independently; do not read or replace those values.
- The working dependency installation is incomplete. Use the existing fresh offline-installed verification copy and portable pinned Node 24.22.2/pnpm 10.34.9; copy source only, excluding `.env`, runtime, dependencies, tooling and generated outputs. No global tool/model installation.
- The owner's active request authorizes local task branches, grouped commits and final local rebase/squash, then continuing subsequent tasks. It supersedes per-group commit questions; publication remains separate.

## Design and boundaries

### Data and validation

Attendance exclusively owns visit records in `attendance.sqlite`. Version 2 appends a named migration after the existing version-1 metadata migration, preserving its application ID and history. Reject unknown/future/foreign schemas, do not migrate at service startup, and use parameterized SQL. Gateway and shared packages must not import SQLite or attendance repositories.

Visit fields: random UUID, normalized display name, normalized self-reported NetID, UTC server-recorded time, fixed `self_reported=1`, a digest identifying an idempotent attempt and a payload digest. No browser cookie, CSRF secret, service token, password, photo, prompt or knowledge data is stored. Names accept Unicode and ordinary punctuation, trim/collapse spaces and normalize NFC, with 1–100 UTF-16 code units after normalization; reject control characters and bound raw input. NetID is a trimmed lowercase 2–32 character ASCII alphanumeric value beginning with a letter. This is a project input bound, not proof of an institutional NetID format or account ownership.

### Contracts and authorization

| Method/path | Contract |
| --- | --- |
| `POST /api/v1/checkin` | Kiosk role only, valid session/Origin/CSRF. Strict JSON `{name, netId, idempotencyKey}`; key is a UUID. Gateway validates and adds server-owned opaque session scope. |
| `POST /internal/v1/visits` | Internal service token required. Strict normalized request plus a 64-hex-character session scope. Attendance commits or replays the visit transaction. No public attendance route. |

Success returns `{requestId, visitId, recordedAt, selfReported:true, replayed}`. It never reflects submitted identity fields. Use 200 for a committed/replayed result, 400 for invalid input, 401/403 for browser auth/role/CSRF failures, 409 `idempotency_conflict` for changed payload under the same session/key, and 503 `attendance_unavailable` for storage/dependency uncertainty. Gateway validates backend status/body/request ID; errors contain fixed messages, not submitted data. Bound the entire upstream call to two seconds and a small JSON body, reject redirects, and never retry automatically. Do not use cached readiness as authorization or a prerequisite for recording a visit.

The session scope is derived server-side from the session's random CSRF material, not accepted from a caller. Attendance stores a digest combining scope and UUID rather than either token. The payload digest covers normalized identity data and is not logged. The same UUID in another kiosk session is an independent attempt. Staff must explicitly Begin a visitor session before manual check-in.

### Idempotency, concurrency and failure

Use an immediate transaction and a unique attempt digest. Matching retry returns the original UUID/time; a changed payload returns conflict without modifying the record. A transaction failure/lock timeout rolls back and returns unavailable. No HTTP success before commit. New UUIDs intentionally represent new visits; this task does not infer or deduplicate people across sessions. A fresh session invalidates the previous attempt namespace.

The browser creates one UUID per attempted submission, disables duplicate clicks and retains that UUID/details in component memory while success is uncertain. Retry the same attempt only at the visitor's action. Changing details starts a new explicit attempt. Clear all input/attempt/success state on visitor reset, session change/expiry or leaving the flow. Do not persist or silently queue personal data in browser storage. An ambiguous disconnect may still commit server-side; the same-key retry resolves that uncertainty.

### Retention and operations

Use the existing project's 30-day visit default, not a claim of institutional approval. Delete visits at or before the UTC cutoff on startup, hourly while attendance is running, before new writes, and through an explicit operator cleanup command. Cleanup uses a bounded transaction; expired data must not become visible through later reads. MS-005 must filter retention on every read even if a cleanup pass failed. Stop/DB failure must not be hidden; return unavailable when storage cannot be trusted. No cleanup depends on knowledge/Ollama or outside services.

Deleting rows is logical retention, not guaranteed erasure from SSDs, WAL files, backups or external copies. Use SQLite secure-delete for owned connections and document its limits. Backup lifecycle/restore and unattended operational scheduling belong to MS-010. This branch adds no backup or machine-wide scheduler.

### Limits and compatibility

Keep MS-001's 240 API requests/minute global bound and add a check-in-specific fixed-memory limit. SQL has a one-second lock wait; upstream requests have a two-second deadline. Tests measure concurrent duplicate behavior and the actual local request path, without promising a production throughput target.

Preserve health/status and separate process lifecycle, internal authentication, missing-model degradation, staff login/logout and offline assets. Update tests that intentionally expected Check in to remain disabled; Ask stays unavailable. Old version-1 attendance databases require an explicit `pnpm db:migrate`; never delete/recreate them to satisfy readiness.

## Ordered commit groups

Finish each group with focused checks and task evidence; inspect and commit named paths only. Split coupled groups when a smaller outcome can be independently verified. Keep development commits, then one local main squash after acceptance.

| Group | Outcome / proposed message | Checks | Status |
| --- | --- | --- | --- |
| 1 | `docs(MS-002): define manual check-in contracts and scope` | Links/whitespace, baseline and dependency refs | Committed as `45db271`; 9 local links and whitespace checks pass |
| 2 | `feat(MS-002): validate manual check-in payloads` | Strict schemas, normalization, bounds, error contracts | Request/response schema tests, focused lint and full typecheck pass; transport errors follow with HTTP wiring |
| 3 | `feat(MS-002): migrate owned attendance visit storage` | Version-1 upgrade, rerun, unknown-owner refusal, rollback/preservation | Planned |
| 4 | `feat(MS-002): record transactional idempotent visits` | Duplicate/concurrent keys, payload conflict, retention boundary, locks/missing DB, synthetic SQL inputs | Planned |
| 5 | `feat(MS-002): expose authenticated internal visit writes` | Internal auth, invalid bodies, persistence success/failure, cleanup lifecycle | Planned |
| 6 | `feat(MS-002): forward guarded bounded check-ins` | Role/CSRF/spoofing, fixed scope/URL, bounded backend statuses/body/time, no retries | Planned |
| 7 | `feat(MS-002): connect manual check-in kiosk form` | Focus/validation, uncertain retry, reset/expiry clearing, disabled duplicate submit, no browser storage | Planned |
| 8 | `test(MS-002): verify local check-in and retention` | Unit/lint/build/process/browser, no-AI operation, offline browser, cleanup CLI, runbook and source/index audit | Planned |

## Acceptance criteria

- [ ] A valid kiosk submission commits exactly one self-reported visit with a server UTC timestamp and fixed success contract.
- [ ] Same-key/same-session retries return the same visit; changed payload conflicts and concurrent duplicate attempts produce one row.
- [ ] Invalid/oversized/control-bearing input and forged scope/role/internal headers cannot write a visit.
- [ ] Missing/expired session, wrong role/CSRF/Origin, full limits, DB locks, failed DB/migration and backend timeout all fail without a false success.
- [ ] Missing knowledge/Ollama cannot prevent attendance recording; attendance/storage failure cannot silently queue personal data.
- [ ] Version-1 migration preserves existing metadata and rejects unknown schemas; rerunning migration is safe.
- [ ] Thirty-day cutoff is inclusive, deletes expired visits/idempotency identity and preserves newer visits; cleanup failure is observable.
- [ ] UI clears personal/attempt/success state on reset/expiry, supports explicit same-attempt retry and writes no persistent browser identity.
- [ ] Existing auth/status/lifecycle behavior remains correct; Ask remains unavailable and camera/microphone unused.
- [ ] Relevant automated checks, runbook, contracts and Git audit pass with synthetic fixtures; unrun platform/rollout gates are reported separately.

## Verification evidence

| Check | Exact command/procedure | Result | Limits |
| --- | --- | --- | --- |
| Baseline/branch | Inspect source/status/manifests/scripts, `git switch -c feat/MS-002-manual-checkin main` | Passed, 13 November 2026 | Local base `c616a00`; unrelated staging preserved; no push |
| New unit/process/browser checks | To fill per group | Not run | No MS-002 runtime behavior implemented yet |
| Offline / platform | To fill during acceptance | Not run | Earlier MS-001 results are historical; no real student data or device rollout |

Contract checkpoint: `packages/contracts/checkin.ts` adds strict browser/internal request and identity-free confirmation schemas. Three tests pass in the offline-installed verification copy, as do focused lint and full typecheck. Unicode NFC/space normalization, NetID casing/bounds, UUID canonicalization, invalid controls, oversized inputs, malformed keys and forged role/scope fields are covered. No endpoint or visit table is enabled by this group.

Attendance migration checkpoint: version 2 appends `attendance-manual-visits`, a strict visits table with unique attempt digests and a timestamp index, preserving the original migration row/application ID. Known version-1 DBs require explicit migration; fresh setup receives both records transactionally. Unknown ownership, objects, layout/history and future versions are rejected. Runtime directory/junction checks run before directory creation. Owned connections enable a one-second lock timeout and secure-delete; no physical-erasure guarantee is claimed. Three attendance database/API tests, focused lint and full typecheck pass in the verification copy; an additional combined regression run included all five auth tests. No operator DB was opened or migrated.

Native TypeScript checkpoint: the new repository's independent-worker test exposed `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` for a constructor parameter property, which Vitest's transformation had hidden. Replaced it with an explicit property assignment; all four workers then succeeded. Enabled TypeScript 5.9's `erasableSyntaxOnly` in the base config and made the same behavior-preserving adjustment in the existing UI error class. Full typecheck passes with the stronger setting. No check was disabled and no Node transform flag/global configuration was added.

Visit repository checkpoint: `visits.ts` owns parameterized immediate transactions, scope/key and payload digests, normalized writes, original-receipt replay, conflict rollback and inclusive retention deletion. Four tests pass (2.46 seconds), including four actual native-Node worker threads with independent connections resolving one duplicate attempt to a single row. Other cases cover a held write lock, missing DB non-creation, invalid control data, separate session namespaces, schema self-report constraint, exact 30-day cutoff and cleanup before new writes. Focused lint and full typecheck pass. All names/NetIDs are synthetic temp-fixture values; no API is enabled yet. Cleanup is one indexed SQL transaction with a one-second lock wait; deletion execution cost depends on expired row count, and production latency/backup erasure are not claimed.

## Contributor explanation

The browser submits a bounded self-report to the gateway. The gateway checks the session and adds an opaque attempt namespace; attendance alone decides whether to insert, replay or reject the transaction. Losing an HTTP reply is not proof the write failed, so the UI reuses its key for an explicit retry. That prevents a second write without guessing whether two people have the same name or NetID.

## Rollback and operational impact

Version 2 is append-only. Rolling back application code does not remove a migration or erase records. Stop writers and preserve a SQLite-safe backup before an operator-approved rollback; older source may refuse the newer schema. Do not drop tables or delete an operator DB. Retention deletion cannot be reversed by reverting code. All development checks use disposable synthetic fixtures; the existing workspace DB files stay untouched.

## Completion record

- Changed files: specification/scope/index only at checkpoint 1; fill runtime paths and evidence as groups land.
- Decisions: gateway role/CSRF boundary, attendance-owned transactions, session-scoped idempotency, self-reported identity, 30-day project default, no AI dependency.
- Limits: no MS-002 tests or runtime features yet; operator data/DBs/dependencies remain untouched.
- Next tasks: MS-003 document ingestion, followed by dependency-ordered backlog; no feature is claimed complete from a UI mock.
- Revision/date: local base `c616a00`, 13 November 2026.

Dependency completion record: MS-001's permanent task file now records its actual local main squash `c616a00`, retained 14-commit development branch, exact squash-tree audit and already-current rebase. This documentation correction records completed Git work; it does not add runtime behavior or claim remote publication.

Design references consulted: official [SQLite transactions](https://www.sqlite.org/lang_transaction.html), [table constraints](https://www.sqlite.org/lang_createtable.html), and [secure-delete pragma](https://www.sqlite.org/pragma.html#pragma_secure_delete). These guide implementation, not evidence of secure physical erasure or institutional policy approval.
