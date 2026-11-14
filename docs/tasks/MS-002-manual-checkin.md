# MS-002 — Idempotent manual check-in

| Field | Value |
| --- | --- |
| Status | Local implementation and acceptance complete; final Git handoff in progress, remote CI/Linux unrun |
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
| 2 | `feat(MS-002): validate manual check-in payloads` | Strict schemas, normalization, bounds, error contracts | Schemas `2282398`; fixed errors `d5bf699`; focused checks pass |
| 3 | `feat(MS-002): migrate owned attendance visit storage` | Version-1 upgrade, rerun, unknown-owner refusal, rollback/preservation | `30a3732`; passed |
| 4 | `feat(MS-002): record transactional idempotent visits` | Duplicate/concurrent keys, payload conflict, retention boundary, locks/missing DB | `ffb0bcb`; native syntax constraint `88d5c57`; passed |
| 5 | Authenticated internal visit writes, maintenance and CLI, split groups | Internal auth, invalid bodies, persistence success/failure, cleanup lifecycle | `385a1fb`, `a4ef0d7`, `a9538cf`; passed |
| 6 | Bounded HTTP and guarded gateway forwarding, split groups | Role/CSRF/spoofing, fixed scope/URL, bounded backend statuses/body/time, no retries | `af717e2`, `dca4738`, `7fa844a`; passed |
| 7 | Kiosk form, browser flows and separate styling | Focus/validation, uncertain retry, reset/expiry clearing, disabled duplicate submit, no browser storage | `b546bcc`, `730406a`; passed |
| 8 | Process checks, command/runbook and final acceptance, split groups | Unit/lint/build/process/browser, no-AI operation, offline browser, cleanup CLI, runbook and source/index audit | `77cbedb`, `5c43053`; final evidence below |

## Acceptance criteria

- [x] A valid kiosk submission commits exactly one self-reported visit with a server UTC timestamp and fixed success contract.
- [x] Same-key/same-session retries return the same visit; changed payload conflicts and concurrent duplicate attempts produce one row.
- [x] Invalid/oversized/control-bearing input and forged scope/role/internal headers cannot write a visit.
- [x] Missing/expired session, wrong role/CSRF/Origin, full limits, DB locks, failed DB/migration and backend timeout all fail without a false success.
- [x] Missing knowledge/Ollama cannot prevent attendance recording; attendance/storage failure cannot silently queue personal data.
- [x] Version-1 migration preserves existing metadata and rejects unknown schemas; rerunning migration is safe.
- [x] Thirty-day cutoff is inclusive, deletes expired visits/idempotency identity and preserves newer visits; cleanup failure is observable.
- [x] UI clears personal/attempt/success state on reset/expiry, supports explicit same-attempt retry and writes no persistent browser identity.
- [x] Existing auth/status/lifecycle behavior remains correct; Ask remains unavailable and camera/microphone unused.
- [x] Final source/Git/docs audit recorded below; all relevant automated checks/runbook are complete, with unrun platform/rollout gates stated separately.

## Verification evidence

| Check | Exact command/procedure | Result | Limits |
| --- | --- | --- | --- |
| Baseline/branch | Inspect source/status/manifests/scripts, `git switch -c feat/MS-002-manual-checkin main` | Passed, 13 November 2026 | Local base `c616a00`; unrelated staging preserved; no push |
| Unit/tooling | `pnpm test` in the offline-installed verification copy | Passed: 16 tooling + 56 Vitest tests in 23 files | No skips; includes native worker concurrency and CLI subprocess checks |
| Static/build | `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed | Strengthened erasable-syntax constraint; no dependency/lockfile change |
| Process | `pnpm test:integration` | Passed: 5 tests in 4 files, 37.03 seconds | Real separate processes, no-AI recording, concurrency, restart/auth and dependency loss |
| Browser/offline assets | `pnpm test:e2e` | Passed: 3 flows, 34.6 seconds | Chromium desktop/mobile, external requests blocked (zero attempts), screenshots visually reviewed; simulated browser expiry plus exact server-clock tests |
| Platform/rollout | Native Windows / operator environment | No operator rollout performed | Remote CI/Linux, Safari and production load/backup erasure unrun; operator DB/dependencies/runtime untouched |

Contract checkpoint: `packages/contracts/checkin.ts` adds strict browser/internal request and identity-free confirmation schemas. Three tests pass in the offline-installed verification copy, as do focused lint and full typecheck. Unicode NFC/space normalization, NetID casing/bounds, UUID canonicalization, invalid controls, oversized inputs, malformed keys and forged role/scope fields are covered. No endpoint or visit table is enabled by this group.

Attendance migration checkpoint: version 2 appends `attendance-manual-visits`, a strict visits table with unique attempt digests and a timestamp index, preserving the original migration row/application ID. Known version-1 DBs require explicit migration; fresh setup receives both records transactionally. Unknown ownership, objects, layout/history and future versions are rejected. Runtime directory/junction checks run before directory creation. Owned connections enable a one-second lock timeout and secure-delete; no physical-erasure guarantee is claimed. Three attendance database/API tests, focused lint and full typecheck pass in the verification copy; an additional combined regression run included all five auth tests. No operator DB was opened or migrated.

Native TypeScript checkpoint: the new repository's independent-worker test exposed `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` for a constructor parameter property, which Vitest's transformation had hidden. Replaced it with an explicit property assignment; all four workers then succeeded. Enabled TypeScript 5.9's `erasableSyntaxOnly` in the base config and made the same behavior-preserving adjustment in the existing UI error class. Full typecheck passes with the stronger setting. No check was disabled and no Node transform flag/global configuration was added.

Visit repository checkpoint: `visits.ts` owns parameterized immediate transactions, scope/key and payload digests, normalized writes, original-receipt replay, conflict rollback and inclusive retention deletion. Four tests pass (2.46 seconds), including four actual native-Node worker threads with independent connections resolving one duplicate attempt to a single row. Other cases cover a held write lock, missing DB non-creation, invalid control data, separate session namespaces, schema self-report constraint, exact 30-day cutoff and cleanup before new writes. Focused lint and full typecheck pass. All names/NetIDs are synthetic temp-fixture values; no API is enabled yet. Cleanup is one indexed SQL transaction with a one-second lock wait; deletion execution cost depends on expired row count, and production latency/backup erasure are not claimed.

Error contract checkpoint: the v1 error schema/logger messages now include fixed `idempotency_conflict` and `attendance_unavailable` codes. The unavailable message explicitly says confirmation is uncertain and suggests retrying the same attempt; it does not claim a write failed. Ten contract/observability tests and focused lint pass. No submitted name, NetID, key or database error is reflected in either message.

Maintenance observability checkpoint: shared logging adds the generic allowlisted `maintenance_failed` event at error severity. Its test confirms raw error/path/private fields are dropped, including with error-level logging. Four observability tests, focused lint and full typecheck pass. The helper contains no retention service logic or domain records.

Attendance HTTP/retention checkpoint: authenticated `POST /internal/v1/visits` validates the strict internal schema and returns only committed/replayed receipts or fixed 400/409/503 errors. Public attendance check-in stays absent. Startup and an unref'ed hourly timer sweep expired visits without migrating or creating a missing DB; close removes the timer. Failed cleanup is logged without record details and causes 503 readiness; a successful record transaction performs cleanup and restores readiness. Four attendance API tests pass, including internal-token rejection, missing-DB failure, replay/conflict, extra-field rejection, inclusive startup/hourly sweep, timer closure and held-lock cleanup failure/recovery. Focused lint and full typecheck pass; no operator DB was touched.

Bounded HTTP response checkpoint: `boundedResponse` returns status plus parsed JSON only for success or explicitly allowed error statuses. Existing `boundedJson` callers retain the success-only contract. Loopback validation, redirect rejection, time/body/type bounds, cancellation and no-retry behavior are unchanged and also apply to accepted error bodies. Three real-loopback HTTP tests pass, including allowed 409, rejected unrelated statuses, oversized/malformed error JSON and redirects even when listed; focused lint and full typecheck pass. Domain callers must still validate the response schema, status and request ID.

Cleanup CLI checkpoint: `services/attendance/cleanup.ts` explicitly loads validated configuration, deletes expired visits and prints only a count. It rejects arguments and emits fixed errors. A real native-Node subprocess test invokes it outside the workspace cwd with a disposable synthetic fixture, proves one expired row is removed, rejects an argument before deletion and checks output contains no fixture identity/scope. That test, focused lint and full typecheck pass. The package command/runbook follows separately; no operator cleanup was run.

Gateway check-in module checkpoint: `checkin.ts` enforces kiosk role, CSRF and a shared ten-attempt/minute bound before forwarding a strict body to one fixed attendance path. It derives the opaque scope from server-resolved session state, sends only server-owned internal auth/request-ID headers, validates status/body/request ID and rewrites backend errors with fixed local messages. Bounded calls allow 400/409/503 bodies, at most 4096 bytes/two seconds, with disconnect cancellation and no retries. Only confirmed success refreshes session activity. Three real-loopback gateway tests and five existing auth tests pass, with focused lint/full typecheck. Tests cover staff/anonymous/CSRF rejection, forged context, distinct scopes, error reflection, quotas, malformed/oversized/mismatched/redirected/stalled responses and one upstream attempt per request. The module is not registered in the production gateway until the next group.

Gateway registration checkpoint: production `createGateway` now registers the guarded check-in module using the same gateway-owned auth instance. Four gateway route/wiring tests and focused lint pass. The wiring test proves anonymous POST rejection without sending synthetic identity to an operator process; valid upstream behavior is tested against isolated fake/fixture services. GET check-in, Ask and arbitrary proxy paths remain absent. UI integration follows separately.

Manual form/browser checkpoint: the kiosk now enables Check in for kiosk sessions regardless of knowledge/model status. `checkin.tsx` validates and focuses fields, uses a synchronous duplicate-submit guard, keeps a UUID plus normalized details in component memory, locks uncertain attempts, supports explicit same-key retry/new-attempt selection, and shows only a committed receipt with Central-time display/self-report labeling. Finish/back clears personal state immediately even if the server reset cannot finish; role/CSRF change or expiry unmounts and aborts the form. Inputs and attempts never enter persistent browser storage. Three Chromium flows pass with non-gateway requests blocked (zero external attempts), including a deliberately dropped successful reply followed by the same UUID, original receipt/replayed flag and exactly one real DB row. Invalid-field focus/ARIA, blank reset, simulated expiry clearing, staff flow and old service-loss smoke are covered. Full lint and typechecked build pass. Styling is a separate following group; desktop/mobile screenshots were captured with those local styles for visual review.

Form style checkpoint: local CSS adds full-width touch-sized fields, readonly/busy states, focus rings and wrapping action controls using existing colors. Desktop 1280×900 and mobile 390×844 full-page screenshots were visually inspected: self-report notice, fields, feedback and controls are readable, with no clipping or horizontal overflow. No asset/dependency/network behavior changed.

Real-process check-in checkpoint: `tests/integration/checkin.test.ts` starts independent fixture services, stops knowledge and concurrently submits four same-key attempts through the real gateway. Exactly one creates a visit; all receipts share UUID/time. Changed payload conflicts, forged scope fails, wrong CSRF fails, reset revokes the old session, and stopped attendance returns unconfirmed 503 while gateway liveness stays available. The owned fixture DB contains exactly one normalized self-reported visit. The full process suite passes 5 tests in 4 files (37.03 seconds), including all previous auth, lifecycle, development proxy and IPC checks. No operator service or database is used.

Cleanup command/runbook checkpoint: added `pnpm attendance:cleanup` without dependency/lockfile changes. The operator runbook documents explicit version-1 upgrade, self-report validation, uncertain retry, quotas, the 30-day project default, startup/hourly/manual maintenance and logical-erasure/backup/rollback limits. The actual package command removed one expired synthetic fixture visit and exited 0; its fixture was disposed after verification. No operator migration or cleanup occurred.

## Contributor explanation

The browser submits a bounded self-report to the gateway. The gateway checks the session and adds an opaque attempt namespace; attendance alone decides whether to insert, replay or reject the transaction. Losing an HTTP reply is not proof the write failed, so the UI reuses its key for an explicit retry. That prevents a second write without guessing whether two people have the same name or NetID.

## Rollback and operational impact

Version 2 is append-only. Rolling back application code does not remove a migration or erase records. Stop writers and preserve a SQLite-safe backup before an operator-approved rollback; older source may refuse the newer schema. Do not drop tables or delete an operator DB. Retention deletion cannot be reversed by reverting code. All development checks use disposable synthetic fixtures; the existing workspace DB files stay untouched.

## Completion record

- Changed files: shared check-in schemas/fixed errors and bounded HTTP result helper; attendance migration/repository/internal API/retention CLI; gateway guarded forwarding; transient kiosk form/styles; unit/process/browser checks; task/architecture/runbooks. Shared packages contain no domain services or database models.
- Decisions: gateway role/CSRF boundary, attendance-owned transactions, session-scoped idempotency, self-reported identity, 30-day project default, no AI dependency.
- Limits: operator data/DBs/dependencies remain untouched; runtime upgrade needs explicit migration. Verification uses the separate offline-installed copy because the original dependency tree is incomplete. Logical retention does not guarantee physical/backup erasure; Windows ACLs remain inherited, rate limits are shared, remote CI/Linux/Safari and production load are unrun. No push/deployment/institutional policy approval is claimed.
- Next tasks: MS-003 document ingestion, followed by dependency-ordered backlog; no feature is claimed complete from a UI mock.
- Revision/date: local base `c616a00`, 13 November 2026.

Dependency completion record: MS-001's permanent task file now records its actual local main squash `c616a00`, retained 14-commit development branch, exact squash-tree audit and already-current rebase. This documentation correction records completed Git work; it does not add runtime behavior or claim remote publication.

## Final local acceptance — 13 November 2026

- Portable Node 24.22.2 / pnpm 10.34.9; no dependency or lockfile changes. Reused the frozen offline-installed verification copy (223 cached packages, zero downloads at its installation), copying source only and preserving operator config/data/dependencies.
- `pnpm test`: 16 tooling + 56 Vitest tests in 23 files pass, none skipped. Four native Node workers independently contend on SQLite and produce one visit; code also passes the stronger erasable-syntax check.
- Full `pnpm lint`, `pnpm typecheck` and typechecked production `pnpm build` pass. Final lint/typecheck include the strengthened browser replay assertion.
- `pnpm test:integration`: 5 tests in 4 files pass (37.03 seconds), including real no-knowledge check-in, concurrent replay, service loss, auth/restart, development boundary and owned shutdown.
- `pnpm test:e2e`: 3 Chromium flows pass (34.6 seconds). A real committed response was deliberately dropped, then the same key returned the same receipt with `replayed:true` and exactly one DB row. External browser requests were blocked with zero attempts. Desktop 1280×900/mobile 390×844 screenshots were visually inspected; no clipping/overflow. Browser expiry is simulated; exact server deadlines remain clock-driven tests.
- Actual `pnpm attendance:cleanup` removed one expired synthetic fixture visit and exited 0; no operator migration or cleanup occurred.
- Source/Git audit: all 29 runtime/test/config paths changed by this task match the tested copy. At the audit checkpoint 40 local Markdown links and 6 anchors resolve; source/doc whitespace checks pass. No runtime/config/dependency/build/tool output enters task commits. The original unrelated staged-entry digest is preserved, and local main remained `c616a00` before handoff. The audit initially compared an abbreviated base with a full SHA; corrected the audit to resolve the inspected ref before comparison.
- No cloud runtime, new package/model/global install, operator/student data copy, push or deployment introduced. Remote CI/Linux, Safari, production load/backup erasure and institutional retention approval are unrun/outside this acceptance. The original working dependency tree remains incomplete; the separate verified copy is the source of passing results.

Final local rebase/squash follows after the documentation groups. Preserve all development commits on the task branch; main receives one task commit. Record its actual SHA when the next task begins rather than fabricating a future value here.

Workspace guide checkpoint: `local/README.md` now describes manual check-in/cleanup/migration, attendance ownership, native erasable TypeScript and the 80-test inventory, with links to the operator runbook and task evidence. This documentation-only group changes no verified runtime behavior.

Design references consulted: official [SQLite transactions](https://www.sqlite.org/lang_transaction.html), [table constraints](https://www.sqlite.org/lang_createtable.html), and [secure-delete pragma](https://www.sqlite.org/pragma.html#pragma_secure_delete). These guide implementation, not evidence of secure physical erasure or institutional policy approval.
