# MS-001 — Local access controls

| Field | Value |
| --- | --- |
| Status | Local implementation and acceptance complete; final Git handoff in progress, remote CI/Linux unrun |
| Branch | `feat/MS-001-access-controls` |
| Owner | Abinash Ghimire; Codex implements within the owner's active request |
| Dependencies | MS-000 local acceptance recorded; local main contains foundation at `7e96e25` |
| Task path | `docs/tasks/MS-001-access-controls.md` |
| PR | Not created; publication not authorized |
| Intended squash commit | `feat(MS-001): protect local staff and kiosk sessions` |

## Problem and outcome

The foundation serves a kiosk shell and system status, but has no browser session or staff authorization. Before adding check-in, document administration, or history, the gateway must distinguish an anonymous kiosk session from a signed-in staff session. A kiosk must begin automatically without staff pairing; opening staff controls must require local sign-in. A forged browser request, expired session, or wrong password must never grant staff access.

## Scope

Implement gateway-owned staff credentials, opaque browser sessions, session rotation/revocation, CSRF checks, bounded request/login limits, and minimal staff sign-in/sign-out UI. Use local assets and Node cryptography only. Verify the service boundary and error behavior using synthetic credentials and temporary fixtures.

No attendance records, photos, face enrollment, document ingestion, answers, LAN access, cloud authentication, public registration, email/password recovery, or deployment. One locally provisioned staff account is sufficient initially; this is not university SSO. Retain the existing internal service-token boundary. Authentication state is not student identity.

## Read before coding

Read [AGENTS.md](../../AGENTS.md), [README](../../README.md), [architecture](../architecture/ARCHITECTURE.md), [setup](../LOCAL_SETUP.md), [Git workflow](../GIT_WORKFLOW.md), [MS-000 evidence](MS-000-foundation.md), and the gateway, HTTP helpers, contracts, UI, configuration and integration fixtures. Read the current task before each implementation checkpoint.

## Baseline and authorization

- Inspected native Windows checkout on 13 November 2026. Local `main` and `chore/MS-000-local-foundation` both point at `7e96e2565d51165eab7fbe5935f07442e8e4628c`. Foundation source is present and MS-000 records successful local acceptance. Remote freshness, CI and independent review have not been verified in this turn; no fetch/pull/rebase/merge was performed.
- The owner's active request explicitly authorized a new branch and proceeding to the task after MS-000. This supersedes the old MS-000-only scope and prohibition on future branches for MS-001 only. Root instructions and the task index are updated accordingly. Local branch creation succeeded; main and the existing branch were preserved.
- The initial index already contains 31,185 staged additions, including installed dependencies, `.env`, runtime databases and generated outputs, plus 13 unstaged PDF deletions corresponding to pre-existing moves. These changes are unrelated to this task and must not be committed with it. No environment values or database contents were read. Preserve the index and files; never use a blanket add/commit. Preparing this checkpoint does not authorize cleanup of pre-existing staging.
- Existing machine Node is 25.8.1; reuse the previously prepared portable Node 24.22.2 and pnpm 10.34.9 under the temporary `ms000-toolchain` directory for checks. Do not alter global PATH, install tools, change Ollama, or download models.

## Design and boundaries

### Ownership and session lifetime

The gateway owns all browser authorization; no auth domain logic belongs in shared packages or the attendance/knowledge services. Its initial session store is bounded process memory. This is a deliberate update to the architecture's proposed persistent session/auth store: credentials will be kept separately under ignored gateway runtime storage, while sessions expire on process restart. This avoids writing bearer credentials to disk and needs no migration or new dependency. Multiple gateway replicas and session persistence are out of scope.

Use independent 32-byte random base64url session and CSRF tokens. Retain only a SHA-256 digest of each session identifier as the lookup key; never log either token. A session contains only its role (`kiosk` or `staff`), CSRF secret, and expiry state. It contains no names, NetIDs, prompts, visit records, or passwords. Read operations return immutable snapshots.

Kiosk idle expiry is 2 minutes with a 30-minute absolute limit; staff idle expiry is 15 minutes with an 8-hour absolute limit. Only an accepted authorized action should refresh idle expiry; status/session polling must not keep a session alive. Use a monotonic in-process clock for elapsed time. Expiry is inclusive at the deadline. Invalid input, expired/revoked tokens, and tokens from another gateway instance fail closed.

Allow at most 128 kiosk and 16 staff sessions, with separate capacity so kiosk churn cannot evict staff. Reclaim expired sessions when creating/rotating sessions; reject overload without evicting active sessions. Rotation issues a new session and CSRF token, invalidates the previous identifier, and retains the old session if replacement fails. The session store does not verify passwords; the later HTTP authentication layer may request a staff rotation only after credential verification.

### Credential and browser design (implemented)

- Operator-only local provisioning CLI; no default staff password or credential in `.env.example`. Hash passwords with a salted Node scrypt record and verify with constant-time comparison. Persist only the hash/parameters under ignored gateway runtime storage; validate file bounds, ownership/path and supported format. Plan exact scrypt resource limits with measured checks before implementing this checkpoint. Never pass a password on the command line or print it. Missing configuration leaves staff login unavailable while the kiosk/status remains usable.
- Use a host-only session cookie with `HttpOnly`, `SameSite=Strict`, `Path=/` and bounded lifetime. Initial plain HTTP loopback cannot promise HTTPS cookie security; require `Secure` with trusted HTTPS in MS-009. No session/password in browser localStorage, sessionStorage, URL or logs.
- Staff login rotates both session and CSRF tokens. Staff logout revokes the staff session and clears transient staff UI; starting the next visitor revokes/replaces kiosk state. Staff privileges never follow an existing kiosk token.
- Require exact allowlisted Origin plus a session-bound CSRF header on every unsafe browser method, including login/logout and session creation/reset. Bootstrap uses an allowlisted Origin and a non-simple custom header, with no permissive CORS, before a session exists. Keep Host validation and add Fetch Metadata checks. SameSite cookies alone are insufficient.
- Gateway enforces route roles and builds upstream context from server-owned state. Strip caller-provided internal token/identity/role headers. Do not create arbitrary downstream proxies or protected success stubs for unimplemented features. Internal health/status remains compatible.
- Bound login attempts before expensive password hashing and bound overall requests, session creation and limiter memory. Use fixed errors and `Retry-After` on 429. Ignore spoofed forwarded client identities on loopback. No automatic retries for login/mutations.

### HTTP v1 contract (enabled after checkpoint 1)

All JSON responses include a request ID and use strict shared technical schemas. Checkpoint 3 defines the exact schemas before enabling these paths:

| Method and path | Caller and result |
| --- | --- |
| `POST /api/v1/session` | Same-origin bootstrap/reset; creates anonymous kiosk session and returns role, CSRF token and expiry information; never a bearer token in JSON |
| `GET /api/v1/session` | Current session metadata/CSRF for reload; absent or expired cookie returns 401; does not extend idle expiry |
| `POST /api/v1/staff/login` | Valid kiosk session + Origin/CSRF + bounded credentials; rotates into staff session after verification |
| `POST /api/v1/staff/logout` | Valid staff session + Origin/CSRF; revokes session and clears cookie |

Public liveness and existing system-status routes stay usable. Existing unavailable check-in/Ask routes stay unavailable. Unauthorized is 401, disallowed role/CSRF/origin is 403, malformed input is 400, overload is 429 or session-capacity 503. Error messages never reflect credential values. Checkpoint 1 alone changed no HTTP contract; later commits enable the versioned routes.

## Ordered implementation checkpoints

The owner authorized grouped local commits and the private-branch rebase/squash workflow on 13 November 2026, then explicitly requested finishing this task and continuing the backlog in dependency order, with a separate branch for each task. This supersedes per-checkpoint commit questions for that work. Finish and verify each coherent group, review its diff, then commit named paths only. Publication/deployment remain unauthorized. Keep development commits grouped; the final task squash is separate. Checkpoint 1 is split into a three-file specification commit and a session implementation/test/evidence commit.

| Order | Outcome and proposed commit message | Verification before commit | Status |
| --- | --- | --- | --- |
| 1 | Gateway session store, specification and active-scope documentation | Session unit tests, existing unit/tooling suites, lint/typecheck, changed-doc link and whitespace checks, preserved unrelated staging | Specification `ebcb51e`; sessions `e5db205` |
| 2 | Local credential provisioning and verification — split module, terminal and command/runbook groups | Password success/failure, malformed/absent files, safe setup/CLI behavior, resource/concurrency bounds, redaction | Implemented and locally checked; no live credential created |
| 3 | Versioned auth contracts, cookies, CSRF, roles and limits — split contracts, limit, HTTP and gateway groups | Fastify HTTP tests for fixation/rotation/expiry, Origin/Host/metadata, CSRF, forged context, rate and capacity limits, dependency failure | Implemented and locally checked |
| 4 | Kiosk lifecycle and staff login/logout UI | Accessible UI, reload/expiry/logout and unauthorized behavior; Chromium smoke; no browser-persisted identity | UI/browser flows `22e7516`; styling `0372dd1` |
| 5 | Real-process acceptance and runbook | Frozen offline install, all lint/type/build/unit/process/browser suites; synthetic credentials; final source/index review | Process boundary `870634b`; provisioning runbook `512da0f`; final evidence below |

### Checkpoint 1 acceptance

- [x] Gateway-owned module issues separate random session/CSRF tokens and exposes immutable snapshots; malformed/unknown tokens fail closed.
- [x] Both roles expire at their documented idle and absolute deadlines; reads and CSRF verification do not refresh activity.
- [x] Rotation invalidates the old identifier and CSRF token, revocation/clear take effect immediately, and another store cannot accept the token.
- [x] Separate 128-kiosk/16-staff limits preserve active sessions on overflow, permit replacement at capacity, and reclaim expired slots.
- [x] Existing automated unit/tooling checks, lint and typecheck pass with dependencies installed from the frozen lockfile offline; the initial index is preserved.

## Acceptance criteria

- [x] Kiosk begins without staff pairing; an invalid/expired/revoked cookie cannot authorize a protected action.
- [x] Valid provisioned staff credentials grant only the documented staff role; missing/incorrect credentials never do.
- [x] Login rotates session and CSRF tokens; the old session cannot be reused. Logout and gateway restart invalidate staff access.
- [x] Idle and absolute expiry apply at their deadlines; session/status polling cannot keep an idle session alive.
- [x] Unsafe routes reject missing/hostile Origin, wrong/missing CSRF, hostile Fetch Metadata and forged client identity.
- [x] Request/login/session limits have bounded memory; rejected traffic cannot evict active staff sessions or trigger unbounded hashing.
- [x] New staff credentials/tokens do not enter commits, logs, JSON responses (except CSRF), URLs, browser storage, or attendance/knowledge databases. The bearer token is delivered only through Set-Cookie; pre-existing unsafe staging is outside this task and excluded from every commit.
- [x] Browser, real-process and clock-driven HTTP/unit tests prove staff/kiosk separation, expiry, logout, and fail-closed behavior with synthetic data.
- [x] Existing local status, health, service isolation, startup/shutdown, disabled future features and offline assets remain correct.
- [x] Runbook, contract schemas, task evidence and relevant automated checks describe the implemented behavior. No remote/device checks are claimed without evidence.

## Verification evidence

| Check | Exact command or procedure | Actual result | Evidence / limitations |
| --- | --- | --- | --- |
| Baseline/branch | Inspect status, branches, worktrees, manifests, scripts and task evidence; `git switch -c feat/MS-001-access-controls` | Passed, 13 November 2026 | Created from local main `7e96e25`; sandbox required elevated Git ref access; no commit/push/merge |
| Initial working-copy checks | `pnpm test`, `pnpm lint`, `pnpm typecheck` using portable Node 24.22.2/pnpm 10.34.9 | 16 tooling tests passed; Vitest/lint/typecheck failed before meaningful full verification | Existing installed dependency tree is incomplete: Vitest cannot resolve `std-env`, ESLint cannot resolve `@humanfs/node`, and typecheck cannot resolve transitive types such as `undici-types`/`playwright/test`. Did not modify installed or staged dependency files, bypass checks, or claim this run passed. |
| Fresh frozen offline installation | Copy workspace to temporary `ms001-verification-*`, excluding `.env`, `.runtime`, `.tools`, dependencies and generated output; `pnpm install --frozen-lockfile --offline --store-dir <temp>/ms000-toolchain/pnpm-store` | Passed, 13 November 2026 | All 8 workspace projects; 223 packages reused, zero downloaded. Pinned Node 24.22.2/pnpm 10.34.9; lockfile unchanged. No operator config, DB or real credentials copied. |
| Session and existing unit/tooling suites | In that fresh copy, `pnpm test` | Passed: 44 tests, none skipped | 16 tooling + 28 Vitest tests in 15 files, including 9 new session cases. Malformed input, independent CSRF, exact idle/absolute boundaries, polling, rotation, revocation/restart isolation, capacity and expiry reclamation covered. No HTTP integration claimed. |
| Static checks | In that same fresh copy, `pnpm lint` and `pnpm typecheck` | Passed | No rule disabled or compiler option relaxed. Session source/tests plus manifest/lockfile hashes match working-copy files. The original installed dependency tree remains unrepaired. |
| Documentation/diff/index | Read intended source/diff; inline Node file/hash/link/whitespace assertions; `git diff --check -- AGENTS.md docs/tasks/INDEX.md`; compare initial/final index SHA-256 | Passed | Five intentional files have final newlines/no trailing whitespace; 9 local Markdown links resolve. Index unchanged: `29598df98f3e2ffa8bec8f0dc0d4e0559461f3edb643f8b53e890324b7b94f5c`. No staging, commits or publication. |
| Auth HTTP/process/browser/offline | Checkpoints 2–5 | Not run | No routes, credentials or UI changes in checkpoint 1; no real student data |

Credential module checkpoint (13 November 2026): `credentials.ts` owns strict private-file parsing, exclusive provisioning and bounded async verification; its two synthetic fixture tests pass (1.90 seconds total), as do focused ESLint and full typecheck in the frozen offline-installed verification copy. The record accepts only scrypt N=131072/r=8/p=1, a 16-byte salt and 64-byte derived key, with a 192 MiB derivation ceiling and one in-flight verification. Unsupported parameters cannot request extra work. Passwords require 15–128 code points, at most 512 UTF-8 bytes, without NUL; no normalization/trimming occurs. Wrong passwords, unavailable credentials, busy verification, malformed/oversized files, directory junctions, salt independence and non-overwrite behavior are checked. This uses the primary [OWASP password-storage scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Files request 0600 and directories 0700; Windows ACL inheritance is unchanged. The terminal provisioning command and HTTP caller remain pending; no real credential was created.

Terminal provisioning checkpoint: `provision-staff.ts` adds two masked prompts, confirmation, a two-minute overall prompt deadline, Ctrl+C cancellation, argument/non-TTY refusal and fixed errors. Two synthetic stream/real-subprocess tests, focused lint and full typecheck pass. An initial test assumed Node removes its shared keypress decoder's data listener; corrected the assertion to verify the password reader's keypress listener is removed on cancellation. No password echo, command-line password or live credential is used. Run directly with `node services/gateway/provision-staff.ts` from `local/` for now; a package command and operator runbook follow separately. Credential module commit: `4e6a6b6`.

Auth contract checkpoint: browser v1 session metadata is strict and contains only request ID, kiosk/staff role, CSRF token and bounded remaining idle/absolute milliseconds (monotonic clocks can produce fractional values). Bearer identifiers, passwords and identity fields are rejected from responses. Login accepts only a bounded password field; bootstrap/logout accept empty objects. Added fixed errors for CSRF/role rejection, rate limiting and auth/session-capacity unavailability. Seven contracts/observability tests and focused lint pass in the verification copy. These additive schemas enable no routes by themselves.

Rate-limit helper checkpoint: gateway-owned `limits.ts` implements a fixed-window bucket with constant memory, a monotonic default clock and rounded-up Retry-After seconds. Its test verifies the exact 60-second boundary, exhausted-window behavior and invalid policies; focused lint passes. Correction to the initially recorded result: concurrent whole-workspace typecheck failed on the next group's uncommitted auth test helper (an `unknown` payload selected an incompatible Fastify injection overload); no helper source error was reported. Corrected that test signature and rechecked before the HTTP commit. No check was disabled. No map is keyed by untrusted IP, cookie or forwarded headers. HTTP wiring follows in the next group.

Auth HTTP module checkpoint: five Fastify-injection auth tests plus limit/server tests pass (7 tests total), with full typecheck and focused lint. `auth.ts` implements the four planned routes and exports a gateway-owned role/CSRF guard for future feature routes. HTTP helper re-exports Fastify types only; no service business logic moved into shared packages. Tests use a test-only protected route which is absent from the production gateway. All unsafe API methods require exact Origin; cross-site/same-site Fetch Metadata is rejected. Bootstrap requires `X-Kiosk-Bootstrap: 1` and `{}`; resetting a valid session also requires its `X-CSRF-Token`. Login uses `{password}`, logout `{}`. Cookie `makerspace_session` is host-only, Path=/, HttpOnly, SameSite=Strict, with an absolute-lifetime Max-Age; Secure awaits trusted HTTPS in MS-009. Responses validate the v1 schemas and never include the cookie token. Expiry is checked again after async password derivation to prevent resurrection after reset/revoke. Fixed global loopback limits are 240 API requests/minute, 20 session creations/resets/minute and 5 login attempts/minute; all clients share them and forwarded headers cannot bypass them. Busy hashing returns 429/Retry-After=1; full session capacity returns 503 with a bounded retry delay. The initial hostile-header test attempted an undefined HTTP header, which the injection harness rejected; it now correctly omits the header. No browser route is enabled until the next gateway wiring commit.

Gateway wiring checkpoint: `index.ts` registers the auth module using gateway-private runtime storage and the existing exact production/development origins. Six gateway/auth tests and focused lint pass. Missing staff credentials leave kiosk bootstrap, liveness, static UI and system status usable while login returns fixed 503. The gateway test now uses a synthetic root for config so it cannot read operator auth files. Internal service ownership and absent future feature endpoints remain intact.

Provisioning command/runbook checkpoint: `package.json` adds `staff:provision` without dependency/lockfile changes. The setup runbook documents masked prompts, fixed parameters, credential location, exclusive creation, restart/reset, session lifetimes, shared rate limits and loopback/Windows permission limits. The terminal CLI's non-TTY/argument refusal is checked through `pnpm staff:provision`; four credential/provisioning tests pass in the verification copy. No operator credential was generated.

Kiosk/staff UI checkpoint: `access.tsx` keeps only role/CSRF/expiry metadata in React memory; a server-issued HttpOnly cookie carries the bearer token. Login/reset/logout requests are explicit, bounded and never retried automatically. An epoch plus pending-operation guard prevents an old poll from overwriting a completed auth transition. Polling never extends idle expiry; missing sessions or gateway loss clear privileged state. Begin/back rotate kiosk state and revoke any previous staff role. The password form clears immediately on submission and unmounts on successful login; no identity/password/session is written to browser storage. Updated Chromium smoke and new staff flow both pass with non-gateway browser requests blocked (zero external attempts). Login failure, reload, cookie attributes/JS invisibility, logout/reuse rejection, visitor reset, simulated session-expiry UI and localStorage/sessionStorage absence are verified. Initial browser failure caught focus being requested before the disabled input re-rendered; focus now runs after busy state clears. Full workspace lint, typechecked production build, 55 unit/tooling tests and 4 process tests also pass in the verification copy. Session expiry in the browser is simulated; exact server deadlines are exercised with its monotonic clock. Real keyboard/OS password masking and Safari remain unrun.

Staff form styling checkpoint: added local CSS for password inputs, focus rings, busy controls, feedback and spacing, using the existing kiosk palette. The built Chromium flows pass at desktop 1280×900 and mobile 390×844; full-page staff screenshots were visually inspected, with readable fields/feedback and no clipping or horizontal overflow. This changes no API, dependency or data behavior.

Real-process boundary checkpoint: `tests/integration/access.test.ts` provisions only a synthetic credential in a temporary fixture, logs in through the running gateway, proves the old kiosk cookie and wrong CSRF fail, proves staff cookies/forged roles cannot authenticate directly to attendance/knowledge, restarts all owned processes and confirms the staff session is invalid. Both service-owned metadata DB files remain byte-identical. The complete integration suite passes 4 tests in 3 files (31.34 seconds), including existing dev proxy, IPC shutdown, service failure/recovery and occupied-port behavior. The intentionally denied Vite `.env` access reports its synthetic temp path; no config content is served. Existing color-environment warnings remain visible.

## Final local acceptance — 13 November 2026

| Check | Actual result and limits |
| --- | --- |
| Pinned frozen offline installation | Node 24.22.2 / pnpm 10.34.9; 223 cached packages, zero downloads, unchanged lockfile; no new dependency |
| `pnpm test` | 16 tooling + 39 Vitest tests in 19 files pass, none skipped |
| `pnpm lint`, `pnpm build` | Full lint and typechecked production build pass; source/dependency checks were not relaxed |
| `pnpm test:integration` | 4 real-process tests in 3 files pass, 31.34 seconds |
| `pnpm test:e2e` | 2 Chromium flows pass, 22.9 seconds; zero external browser attempts; desktop/mobile screenshots visually inspected |
| Source/Git/docs audit | All task runtime files match the tested copy; no environment/runtime/dependency/build/tool artifacts enter task commits; unrelated staged-entry content digest preserved; 23 local Markdown links resolve at this checkpoint |
| Local rebase | Clean detached worktree at `870634b`, `git rebase main`: HEAD is up to date; no source or commit changed, so the passing checks remain applicable. No autostash containing unrelated runtime files was created |
| Unrun/existing limits | Remote CI/Linux, Safari, physical terminal masking and new machine-wide offline/model checks unrun. Existing checkout dependencies are incomplete; tests passed in the separate offline-installed copy. No operator credential, live student data, model download, global setting or deployment introduced |

The owner requested grouped commits and the final local rebase/squash workflow, followed by the remaining tasks in dependency order. Keep this task's grouped branch history. The final task squash belongs on local main after all groups are committed; no push, remote PR or remote merge is claimed. Record resulting commits through Git rather than inventing a future merge SHA in this document.

## Contributor explanation

A browser will hold an opaque cookie; only the gateway can resolve it to a kiosk or staff session. A separate random CSRF token will accompany browser mutations. The session module supplies expiry, bounded storage, rotation and revocation, but does not prove that a caller knows the staff password. That verification and the browser checks must be implemented together before staff routes are usable.

Restarting the gateway signs everyone out. This is intentional for the first single-process implementation. A full store returns a controlled capacity error rather than removing someone else's active session. Later multi-host operation would need a reviewed persistent store and scoped/encrypted service authentication.

## Rollback and operational impact

Checkpoint 1 adds an unused module and tests; no running route, configuration, database, dependency, lockfile or runtime file changes. It can be removed independently without a data migration. Later credential creation must preserve pre-existing files and have a documented reset procedure. Reverting code cannot reverse future credential provisioning; preserve or remove runtime data only at the operator's direction. No live operator credential is created for acceptance.

## Completion record

- Changed files: `AGENTS.md` aligns active scope with the owner's request; `docs/tasks/INDEX.md` links this task; this file defines scope/contracts/evidence; `local/services/gateway/sessions.ts` and `sessions.test.ts` implement and check the first module.
- Decisions: process-memory sessions, separate kiosk/staff capacity, digest lookup keys, monotonic expiry, explicit activity refresh, no new runtime dependencies.
- Limitations: the working-copy dependency installation is incomplete; verification succeeded in a separate frozen offline-installed copy. Pre-existing unsafe staging is preserved and excluded from the task commits. Sessions are volatile, staff authentication is one local account, cookies have no Secure attribute on initial plain loopback HTTP, limits are shared by local callers, and Windows ACLs are inherited. Remote CI/Linux, physical terminal masking and Safari are unrun. These do not grant LAN or real-data rollout approval.
- Follow-up tasks: MS-002 and MS-003 remain dependent on completed access controls; no implementation is authorized for them.
- Verified revision/date: base `7e96e25`, specification commit `ebcb51e` and subsequent locally verified session checkpoint on 13 November 2026. No PR/publication is claimed. `git fetch origin main` confirmed remote main still at `ccf3c34`; preserve the separate local MS-000 foundation commit during later rebase/squash.

## Design references

Consulted the primary [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), and [Node 24 cryptography reference](https://nodejs.org/docs/latest-v24.x/api/crypto.html) on 13 November 2026 for randomness, rotation, expiration, cookie and CSRF design. These explain security mechanisms, not evidence that the pending HTTP implementation is secure.
