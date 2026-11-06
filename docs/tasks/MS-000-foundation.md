# MS-000 — Build the local-first microservice foundation

| Field | Value |
| --- | --- |
| Status | Implementation and local Windows acceptance complete, including real CPU-model offline and native console Ctrl+C/restart checks; remote CI/review/merge not performed |
| Branch | `chore/MS-000-local-foundation` |
| Target | `Abhinash2018/Makerspace-V1` main, through a pull request |
| Owner | Abinash Ghimire; Codex implements with owner approval at Git checkpoints |
| Task file | `docs/tasks/MS-000-foundation.md` |
| Dependencies | None; preserve existing documents and repository history |
| Intended squash commit | `chore(MS-000): establish local Ollama microservice foundation` |

## Goal in plain language

Create the base that later features plug into. A new contributor should be able to install the documented prerequisites, start the project, see the kiosk shell, and tell whether each local service and Ollama is available. No external backend or cloud account is needed.

The initial system proves that the pieces start separately and communicate correctly. It does not pretend that attendance recording or document question answering already works.

## Required reading and scope

Read root `AGENTS.md`, `README.md`, `docs/architecture/ARCHITECTURE.md`, `docs/LOCAL_SETUP.md`, and `docs/GIT_WORKFLOW.md`. Runtime paths below are relative to the planned `local/` workspace. Project documentation remains in root `docs/`, and `.github/workflows/local-ci.yml` belongs at repository root.

## Inspected baseline and repository decision

- Inspection date: 6 November 2026, native Windows PowerShell.
- Baseline: `ccf3c34bcd69a0bfc0ea82522951d7903492c223` on `main`; initial `git status --short` was empty. Earlier commit `907ef71` remains in history.
- Configured origin: `https://github.com/Abhinash2018/Makerspace-V1.git`. Cached `origin/main` matched the baseline; no fetch or pull was performed, so remote freshness has not been verified.
- Inventory: root `AGENTS.md`, `README.md`, and `docs/` with task/architecture/setup/workflow documents and 13 reference PDFs. No application source, manifests, lockfiles, scripts, CI, or root package-manager workspace existed at baseline.
- Read all tracked Markdown and the reference PDFs before implementation; the image-only FOM manual was rendered and visually inspected using temporary tools outside the repository. This was reference review, not document ingestion or application validation.
- Keep documents at their current root paths and create the runtime under `local/`. The original specification assumed placement inside the separate MakerspaceAssistant repository; that assumption does not match this checkout. No older application is available here for baseline runtime tests, and no changes to that separate repository are authorized.
- Existing tools: Node `25.8.1`, npm `11.11.0`; pnpm and Ollama were not found on PATH. The required Node 24 LTS toolchain and model setup are pending. No global installation or machine configuration changes have been made.
- The owner explicitly approved creation of `chore/MS-000-local-foundation` from the baseline and the group 1 local commit. Documentation commit `9715abaf391b439027a34a61720e8467b12f503f` was created on that branch. No push, rebase, or merge has been performed or authorized.

## Ordered commit groups

### Owner-authorized smaller commits (10 November 2026)

- Tooling dependencies: frozen offline installation, 16 bootstrap tests, lint/typecheck passed; Vitest reports `5.1.0` on pinned Node `24.22.2`. Added no machine-wide tools. TypeScript lint/typecheck coverage extends to new service, shared-package, UI, and test source as each checkpoint lands.

The owner requested completion of all remaining MS-000 implementation and local commits of roughly 2–3 files each. This authorizes the remaining local commits without another approval question per commit; it does not authorize push, rebase, merge, deployment, machine-wide changes, or model downloads. Groups 3–8 below are split into sequential checkpoints: pinned test/build tooling; lint/type configuration; package dependency manifests/lockfile; contracts and tests; observability and tests; bounded HTTP helpers and tests; each service's owned migration code and tests; each service's server/config and tests; Ollama adapter and failure tests; CLI probe and tests; gateway aggregation/boundaries and tests; kiosk shell/styles; launcher and lifecycle tests; doctor and tests; browser tests; CI; final runbook/acceptance evidence. Each behavior checkpoint carries its tests and a task evidence update where feasible; dependency-only checkpoints verify frozen installation. Native Node 24 executes backend TypeScript directly, while TypeScript checks all runtime source and Vite builds the kiosk. A real downloaded-model/offline probe remains a separate manual gate if Ollama is unavailable; never mark it passed from fake-runtime tests.

Finish one group, run its checks, inspect the diff, and commit named paths only. The owner's active authorization covers all remaining local MS-000 commits in groups of roughly 2–3 files, superseding the earlier per-commit approval checkpoint. Publication, rebase, merge and machine-wide changes remain outside that authorization. Include relevant tests, contract notes, and evidence; final verification adds task-wide checks.

Each development commit must have one coherent outcome and declare any dependency on earlier groups. Keep its relevant checks passing at that checkpoint so a later regression can be traced to the introducing commit. Fix that step in a focused follow-up commit; do not rewrite an earlier approved commit without approval. Split a group further when its parts can be verified separately.

| Order | Outcome | Proposed commit message | Verification before commit | Status |
| --- | --- | --- | --- | --- |
| 1 | Correct repository assumptions, record baseline and contributor checkpoints | `docs(MS-000): align repository layout and implementation checkpoints` | Diff/whitespace review, local Markdown links and anchors, task-path consistency, reference PDF preservation | Committed as `9715aba` after owner approval |
| 2a | Workspace, pinned tooling, lockfile, basic check commands, ignore rules; depends on group 1 | `chore(MS-000): scaffold pinned local workspace tooling` | Tested Node/pnpm versions, frozen install, lint/type checks, ignore-rule checks; application build not available yet | Committed as `b12ed80` after the owner's 10 November grouped-commit request |
| 2b | Validated configuration and non-overwriting local setup; depends on group 2a | `feat(MS-000): add validated configuration and safe local setup` | Configuration/setup success and failure tests, secret/runtime exclusion checks, applicable lint/type checks | Completed in this commit following the owner's request to proceed to the next group |
| 3 | Versioned HTTP schemas, request IDs, redacted logging helpers | Split into 2–3-file commits | Schema/error/request-ID/logging and HTTP tests | Committed; checks pass |
| 4 | Separate service processes, authentication, DB migrations and health | Split into dependency, migration and server commits | Unit and real-process ownership/auth/recovery tests | Committed; checks pass |
| 5 | Loopback discovery and explicit developer probe | Adapter and CLI commits | Fake-runtime checks and real CPU inference with outbound traffic blocked | Committed; local model gate passed |
| 6 | Gateway aggregation and local kiosk | Status, HTTP, dependencies, UI and Vite commits | Cache/boundary tests, build and Chromium smoke | Committed; checks pass |
| 7 | Launcher, shutdown and doctor | Launcher, diagnostics and integration commits | Windows IPC, native console Ctrl+C, restart, ports and development checks | Committed; local checks passed |
| 8 | CI, verification and handoff | Test, workflow and documentation commits | Fresh frozen offline install and all local automated suites | Implemented; remote CI/Linux unrun |

Local grouped commits are authorized by the owner's active request. Ask before new branch operations, pushing, rebasing, merging or machine-wide changes. Rebase the private branch onto verified current main only after approval, recheck affected behavior, and use **Squash and merge** after acceptance/review. No future feature branch is created during MS-000.

Group 1 acceptance: all existing Markdown links and relative anchors resolve; contributor paths point to root documents rather than nonexistent local copies; the baseline and commit groups are recorded; reference PDFs remain unchanged; runtime acceptance remains unchecked. No application tests are claimed for documentation preparation.

Group 2a acceptance: exact Node/pnpm versions agree with manifest pins; tooling installs from the frozen lockfile in a fresh directory; lint and tooling typecheck pass; incompatible Node/package-manager versions fail; environment files, runtime databases, installed dependencies and generated outputs are ignored while examples/source/reference files remain eligible for Git. No placeholder application/test/build commands are added. Group 2b owns validated runtime configuration and token generation.

Group 2a choices and changed files:

- Root `.gitignore` excludes secrets, runtime/model/dependency files and generated outputs. Root `.gitattributes` declares LF source/document text and binary PDFs/assets without changing machine Git settings or rewriting existing files.
- `local/package.json`, `.node-version`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` pin the toolchain/development dependencies and define the future workspace package globs. No runtime dependencies or empty service packages are added yet. The dependency-build allowlist starts empty and must be updated explicitly when native dependencies are introduced.
- `local/scripts/check-toolchain.mjs` checks active Node, manifest pin agreement, and active package-manager identity/version during package-manager scripts and installation. It resolves files relative to its own location so running from repository root is safe.
- `local/eslint.config.mjs`, `tsconfig.base.json`, and `tsconfig.json` check existing tooling; future TypeScript services/UI will add their own checks with their code. The workspace guide, root README, setup guide, and this task explain current commands and pending runtime work.
- Tested pins: Node `24.22.2`, pnpm `10.34.9`, ESLint `10.14.0`, `@eslint/js` `10.0.1`, TypeScript `5.9.3`, `@types/node` `24.19.2`, `globals` `16.5.0`. Node 24 follows the task's major-version requirement. pnpm 10 uses the documented JavaScript CLI and supports this Node version. Versions were resolved from official release/registry metadata and are fixed rather than tracking latest tags.
- Initial installation with ESLint `9.39.5` reported an unsupported release. Investigated the official support policy and replaced it with ESLint 10 before verification; no warning was suppressed and the discarded pin will not be committed. See [ESLint support](https://eslint.org/version-support/) and [pnpm 10 settings](https://pnpm.io/10.x/settings).
- Rollback before commit: review and remove only this group's additions if requested; no runtime DB/config or application data has been created. After committing, use an approved focused revert. The temporary tools do not replace installed tools or require a machine-wide rollback.

Group 2b acceptance: setup creates a fresh `.env` with a generated 256-bit token and distinct service runtime directories; repeated/concurrent setup cannot overwrite existing config or data; invalid configuration fails with safe errors; local-only URLs, matching/distinct ports, and ignored runtime storage are enforced. Empty model configuration is valid. Unit and CLI tests, lint/typecheck, frozen installation, Git exclusions, and documentation links must pass. No service readiness, model installation, or HTTP behavior is claimed.

Group 2b choices and changed files:

- `local/.env.example` documents non-secret defaults with a blank token. `packages/config/package.json` and `index.mjs` provide Node-only parsing, validation, explicit loading, and runtime path checks. They contain no database models or domain services. Service-owned startup schemas arrive with group 4; the later knowledge adapter owns model discovery and bounded HTTP requests.
- `scripts/setup-local.mjs` generates a 32-byte random token and uses exclusive `.env` creation, checks existing runtime paths for junctions/symlinks, and preserves existing contents. `scripts/check-config.mjs` reports validation outcomes without printing environment values. Commands resolve from workspace location rather than caller cwd. Setup does not copy ambient overrides into `.env`; loading applies known environment overrides over file values.
- `tests/tooling/` verifies configuration, real temporary filesystem operations, CLI error/output behavior, Windows junction rejection, and concurrent setup. Node's built-in runner is sufficient for these dependency-free bootstrap helpers; Vitest remains the planned service/application runner. This is an intentional tooling-test choice, not a disabled check. Helpers use checked JavaScript consistently with group 2a. See [Node environment parsing](https://nodejs.org/download/release/v24.22.1/docs/api/util.html#utilparseenvcontent), [exclusive filesystem flags](https://nodejs.org/docs/latest-v24.x/api/fs.html#file-system-flags), and [Node tests](https://nodejs.org/docs/latest-v24.x/api/test.html).
- `local/package.json` exposes `setup:local`, `config:check`, and `test:tooling`; TypeScript checks include the helper/tests. The lockfile adds only the dependency-free config workspace importer, with all external pins unchanged. Root `.gitattributes` explicitly keeps `.env.example` at LF. README, workspace guide, setup runbook, architecture, and this task describe the actual contract and its limits.
- Runtime storage is deliberately constrained to the ignored workspace `.runtime/` tree. Modes `0600`/`0700` are requested for new files/directories; Windows ACL inheritance is unchanged and no owner-only ACL guarantee is claimed. Tests use synthetic temporary workspaces; no workspace `.env`, production data, DBs, or models are created. Setup failure may leave empty directories but never replaces existing config or removes data. Local OS attackers racing path operations remain outside this deployment boundary.

## Implementation scope

Implement:

- React + TypeScript + Vite kiosk shell, with local assets and accessible touch controls.
- TypeScript + Fastify gateway, attendance service, and knowledge service as independent Node processes.
- Health and readiness contracts, request IDs, bounded HTTP calls, validated configuration, structured logs, and consistent errors.
- An Ollama adapter for model discovery and an explicitly invoked developer chat probe.
- Local service-owned SQLite migration infrastructure and empty initial databases containing migration metadata only. No student tables yet.
- pnpm workspace configuration, lockfile, lint/typecheck/build/test commands, developer launcher, shutdown handling, and CI.
- Human setup documentation, task evidence, architecture, and branch workflow.

Do not implement check-in, authentication, document ingestion/RAG, face enrollment, voice, staff reports, LAN exposure, installers, Kubernetes, a message broker, multi-host replication, or live data migration. No dummy success responses for these features. MS-001 handles identity/session controls before any real data endpoint is enabled.

## Proposed stack and version policy

Use Node 24 LTS with an exact tested patch recorded in the project, pnpm with an exact `packageManager` version, React/TypeScript/Vite, Fastify, Zod, and SQLite through a Node-24-compatible `better-sqlite3` release. Use Vitest for unit/integration tests and Playwright for the browser smoke test. These are selected design choices, not a claim that a particular version set has already been tested.

Resolve compatible versions during implementation, commit the lockfile, and verify installation on the declared target. This checkout has no existing dependency versions; the original specification's description of the separate older app is historical context. Keep Python and Docker out of the mandatory initial setup. Record native SQLite build prerequisites if a prebuilt binary is unavailable.

## Required directory responsibilities

| Path | Responsibility |
| --- | --- |
| `apps/kiosk/` | UI only; no database or direct Ollama access |
| `services/gateway/` | Same-origin static UI hosting in production, `/api/v1` routing, aggregate status |
| `services/attendance/` | Independent skeleton; owns its DB and migrations |
| `services/knowledge/` | Independent skeleton; owns its DB, Ollama adapter, and diagnostics |
| `packages/contracts/` | Versioned request/response schemas and generated/inferred types |
| `packages/observability/` | Request-ID and redacted logging helpers |
| `scripts/` | Cross-platform start, config generation, migration, doctor, and smoke commands |
| `tests/integration/` | Real local HTTP and lifecycle checks |
| `tests/e2e/` | Kiosk browser smoke test |
| `../docs/` | Root project specification and implementation notes; no duplicate local docs tree |
| `.runtime/` | Ignored per-service DBs and local generated data |
| `.env.example` | Documented non-secret settings; secret values blank |
| `.env` | Ignored local configuration generated by setup |

Each service has its own package, entrypoint, scripts and tests. Each entrypoint validates bootstrap configuration before binding, using the shared technical schema; there are no domain settings yet. Future service-specific configuration schemas remain service-owned. Root workspace scripts compose independent processes rather than importing all service implementations. Service code must not import another service's source or open its DB.

## Implementation steps

1. Record `git status`, current branch, and baseline commit. Create the task branch from current main after owner approval using the Git workflow. If the checkout has unrelated work, preserve it and use an isolated worktree when necessary. Follow the ordered commit checkpoints above throughout implementation.
2. Create the isolated `local/` workspace while preserving root documents and reference PDFs. No legacy app or root pnpm workspace exists in this checkout; no legacy workspace exclusion is needed.
3. Create service entrypoints, config schemas, shared contracts, and package scripts. Give each service its own health/readiness routes and internal token check.
4. Generate a strong local service token via `pnpm setup:local`; never overwrite an existing `.env`. Bind all processes to `127.0.0.1`. Validate Host/Origin at the gateway, disable permissive CORS, and protect internal routes even on loopback.
5. Implement isolated SQLite migration tracking for attendance and knowledge. Re-running the migration command must be safe. Startup verifies the required migration version; it must not destructively recreate a database. No cross-service SQL and no live data import.
6. Implement the knowledge service's Ollama adapter. Permit only the configured loopback address; reject arbitrary request-supplied hosts/models and redirects. Discover models with `GET /api/tags`, enforce a short timeout, and distinguish unavailable runtime from absent configured model. No automatic download and no cloud fallback.
7. Add a developer-only CLI probe using `POST /api/chat` with `stream: false`, a fixed harmless prompt, configured local model, bounded output, and cancellation. Do not expose a public chat route. Record model ID/digest and probe result, not visitor content.
8. Implement aggregate status through gateway → internal services. The browser calls only the gateway. Build a touch-first “Ingram Makerspace Assistant” shell with Begin, disabled Check in/Ask controls labeled as upcoming, and a readable system-status panel. Camera and microphone stay off.
9. Implement launch/stop scripts that use Node process APIs rather than POSIX-only shell tricks. Report occupied ports clearly; terminate only owned child processes on shutdown. Do not start a second Ollama daemon if one is already running. Document how to start Ollama independently.
10. Implement checks and CI. CI uses controlled fake Ollama responses; real local model checks are a separate manual integration gate. Never require credentials or model downloads in CI.
11. Run acceptance checks, update this file with exact evidence, and prepare the PR. Update setup docs to match the actual commands. Stop at MS-000.

## Initial API contract

All JSON responses include a generated/validated request ID, echoed in `X-Request-ID`. Do not trust arbitrary unbounded caller IDs. Error bodies use `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. Do not return stack traces or environment values.

| Endpoint | Behavior |
| --- | --- |
| Each service `GET /health/live` | 200 if the process can handle requests; no dependency checks |
| Attendance `GET /health/ready` | 200 if DB is accessible and migrations current; otherwise 503 |
| Knowledge `GET /health/ready` | 200 if its DB/config are usable; otherwise 503; Ollama is a separate capability |
| Gateway `GET /health/ready` | 200 when UI assets/config and both internal services are ready; otherwise 503 |
| Gateway `GET /api/v1/system/status` | 200 with aggregate `ready`, `degraded`, or `unavailable`, and per-component status; no paths, tokens, or student data |
| Knowledge internal `GET /internal/v1/model-status` | Token-protected; Ollama reachable/model available flags and bounded diagnostic code |
| Unimplemented feature paths | 404 with standard error, never fabricated success |

The gateway status remains readable when an internal service fails. Ollama failure makes the system degraded, not a dead gateway. Future attendance must remain independent of AI availability. Health live may be unauthenticated on loopback; all other internal service routes require the service token. Gateway health/status are public only within this initial loopback deployment.

Use 2-second deadlines for status dependency calls, no automatic retry, bounded response sizes, and a 5-second status cache to avoid fan-out on every UI render. The explicit chat probe may allow 120 seconds for cold model loading, cancel cleanly, and must never run as part of health polling.

## Commands the implementation must provide

Run from `local/`; these are required command names to implement, not commands that already exist in this document package.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm db:migrate
pnpm dev
pnpm doctor
pnpm ollama:probe
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm start
```

`dev` runs the kiosk dev server and all three services. `start` serves the built kiosk from the gateway and starts only the three backend services; no Vite development server. Document browser installation for Playwright as a one-time developer setup step. `doctor` checks configuration, DB readiness, service reachability, and local model availability without changing data or pulling models.

## Acceptance criteria

- [x] Fresh documented install succeeds with a committed lockfile and exact tested versions.
- [x] Existing project documents and reference PDFs remain intact except explained documentation updates; root workspace/CI changes are explained. No changes to the separate legacy application or deployment are made.
- [x] Production build serves shell/status without cloud access (browser fixture uses isolated loopback ports; documented default is `http://127.0.0.1:3000`).
- [x] Gateway, attendance, and knowledge are separate processes and can be started independently.
- [x] All listeners are loopback-only; unauthorized internal requests fail; hostile Host/Origin is rejected.
- [x] UI never calls Ollama or internal services directly; feature buttons cannot submit student data.
- [x] Migration rerun is safe, and each service uses only its own database.
- [x] Stopping the controlled fake Ollama produces degraded status while other services remain ready; real-runtime confirmation belongs to the manual gate below.
- [x] Missing model and runtime timeout are distinguishable, bounded, and do not trigger downloads.
- [x] Stopping attendance yields aggregate failure without crashing the UI; restart restores status.
- [x] Production assets load with non-gateway browser requests blocked; no CDN/API requests appear. Final real-model run additionally blocks non-loopback outbound traffic for Node, Ollama and its runner without disconnecting unrelated machine networking.
- [x] Local Ollama probe succeeds with a downloaded model while application external networking is blocked: qwen3:4b, explicit CPU mode.
- [x] Lint, typecheck, unit, integration, browser smoke, and build checks pass; relevant failure-path tests included.
- [x] Windows console Ctrl+C stops owned processes; restart and occupied-port preservation pass. CTRL_C_EVENT was delivered through the OS console API to the dedicated pnpm start console; no human keyboard press is claimed.
- [x] Committed MS-000 diff contains no real data, runtime DBs, credentials, downloaded model weights, or generated builds.
- [x] Task evidence and README reflect actual behavior, including Windows validation and explicitly untested gates.

## Evidence to fill during implementation

The table preserves historical checkpoint results. Current task-wide results and remaining limits are recorded below it and in the final verification section; early statements about missing application code describe those earlier checkpoints only.

| Check | Command / method | Result | Evidence / limitation |
| --- | --- | --- | --- |
| Baseline | `git status --short`, `git branch -avv`, `git log -5 --oneline`, `git ls-files`, `git remote -v`, `git rev-parse HEAD` | Inspected | Clean main at `ccf3c34bcd69a0bfc0ea82522951d7903492c223`; docs-only repository; cached origin/main matched, live remote not fetched |
| Task branch | `git switch -c chore/MS-000-local-foundation` after explicit owner approval | Succeeded | Created from baseline; sandbox required elevated Git ref access; main preserved |
| Group 1 documentation | `git diff --check`; full `git diff` review; inline Node filesystem/Git checks of Markdown links/heading anchors, stale paths, PDF object hashes, changed paths, index, branch and baseline refs; `git diff --cached --check` before approved commit | Passed, 6 November 2026 | At group 1 verification: 8 Markdown files, 9 local links/anchors, 13 PDFs unchanged, exactly 7 intended docs. Committed as `9715aba`; main preserved. Existing LF-to-CRLF warnings were informational; no whitespace errors |
| Group 2a tool versions | Portable Node `--version`, pnpm `--version`, `pnpm check:toolchain` | Passed, 6 November 2026 | Node `24.22.2`, pnpm `10.34.9`, native Windows x64. Node executable SHA256 matched official release sums: `1c331340fa6cac5e4294725959070a143fa0507195a78ad77eed7943f719aac9`; pnpm archive SHA512 matched registry integrity. Temporary toolchain only; no global install/settings changes |
| Group 2a frozen installs | `pnpm install --frozen-lockfile --offline` with explicit temp store/cache; repeated in a new temporary copy with no node_modules | Passed, 6 November 2026 | Fresh copy installed 82 packages from the populated store without downloading. Both installs preserved lockfile SHA256 `99ea86b98bfff809a2c06b1292ecd39de4bf08bc1e8e0255fbd6c81af1e82073`. Normal initial online install generated the lockfile first. This is dependency reuse evidence, not offline application/model evidence |
| Group 2a static checks | `pnpm lint`, `pnpm typecheck`, repeated after fresh frozen install | Passed, 6 November 2026 | ESLint reports no errors/warnings; TypeScript checks the existing JavaScript tooling without output. Services/UI/build/test suites are not implemented yet |
| Group 2a version failures | Inline Node child-process assertions: run guard from repository root under Node 24/25, npm and mismatched pnpm user agents; run pinned pnpm install under Node 25 | Passed, 6 November 2026 | Node 24 direct invocation succeeded; Node 25 and wrong package managers exited 1 with actionable messages. pnpm install rejected Node 25 with `ERR_PNPM_UNSUPPORTED_ENGINE`; lockfile unchanged |
| Group 2a Git exclusions | `git check-ignore --no-index -q -- PATH`, asserted from repository root | Passed, 6 November 2026 | 13 representative secret/runtime/generated paths ignored; 6 source/example/reference paths retained |
| Group 2a final review | `git diff --check`; tracked diff and all new source/lockfile review; inline Node link/anchor, PDF hash, file-set, newline, pin and Git-state assertions | Passed, 6 November 2026 | 9 Markdown files, 16 local links/anchors; all 13 PDFs match baseline; 11 intended new files plus 3 documentation updates; index empty, HEAD at `9715aba`, main at baseline. New text is LF with no trailing whitespace; all runtime acceptance boxes remain unchecked. Group 2a is ready for owner review and local commit approval |
| Group 2a commit revalidation | Portable Node/pnpm; `pnpm install --frozen-lockfile --offline`, `pnpm check:toolchain`, `pnpm lint`, `pnpm typecheck` in `local/` and a fresh temporary copy; inline Node assertions for toolchain failures, ignore rules, local Markdown links and PDF hashes; staged diff/whitespace review | Passed, 10 November 2026 | Node `24.22.2`, pnpm `10.34.9`; fresh install reused 82 packages with zero downloads; lockfile SHA256 remains `99ea86b98bfff809a2c06b1292ecd39de4bf08bc1e8e0255fbd6c81af1e82073`. Five toolchain cases, 13 ignored/6 retained paths, 9 Markdown files/16 local links passed. All 13 PDFs retain their HEAD blob hashes at their current `docs/pdfs/` locations; those pre-existing moves are excluded from this tooling commit. The owner requested grouped MS-000 commits; only group 2a is ready. No application/build/model checks are available yet |
| Group 2b configuration/setup tests | `pnpm test:tooling` in the workspace and fresh temporary install | Passed, 10 November 2026 | 16 tests, zero failed/skipped: configuration defaults and rejection paths, URL normalization tricks, collisions, traversal, CRLF/quotes/duplicates, environment precedence, no process environment mutation, existing config/data preservation, token generation, real Windows junction rejection, CLI invocation from another cwd, secret-free errors and concurrent setup. Tests created synthetic temporary workspaces only; workspace `.env`/`.runtime` remain absent |
| Group 2b static checks and corrections | `pnpm lint`, `pnpm typecheck`; repeated after fresh install | Passed, 10 November 2026 | Initial checks exposed overly narrow inferred default types and a test comparing Node's special `process.env` object directly with a plain snapshot. Added an explicit mutable string-map type and compare environment contents without dumping them on failure. No checks disabled; final lint, full tooling typecheck and tests pass |
| Group 2b frozen installation | `pnpm install --frozen-lockfile --offline` in workspace and a fresh temporary copy | Passed, 10 November 2026 | Node `24.22.2`, pnpm `10.34.9`; 2 workspace projects; 82 packages reused, zero downloaded. Lockfile SHA256 `88fcd31704624dc3e48ae1c207af1e321ea8dc32cb150d1cf14ed73a9fb78d1b` unchanged by either frozen install. Only dependency-free config importer added; external dependency pins unchanged |
| Group 2b Git/docs review | Inline Node filesystem/Git assertions; source and staged diff review; `git diff --check`, `git diff --cached --check` | Passed, 10 November 2026 | 7 runtime/secret/output paths ignored; 3 example/source/test paths retained; committed example token blank; 9 Markdown files/18 local links and anchors valid. All 13 moved PDFs retain their original blob hashes and remain outside this commit. No actual environment values, generated config, DBs, model files or build outputs staged |
| Application automated checks | pnpm lint, test, build, test:integration, test:e2e | Passed, 10 November 2026 | 16 tooling + 19 unit + 3 process + 1 browser tests; build includes full typecheck; repeated in fresh offline-installed workspace |
| Offline UI | Block all non-gateway browser requests | Passed, 10 November 2026 | Fresh Chromium context; no external attempts, desktop/mobile checked; no machine firewall claim |
| Local model | `pnpm ollama:probe --cpu` under temporary app-scoped outbound firewall rules | Passed, 10 November 2026 | Existing Ollama 0.32.5/qwen3:4b; 1515 ms final isolated generation; full hardware/digest evidence below |
| Failure recovery | Stop fake Ollama and real attendance/gateway processes | Passed, 10 November 2026 | Cache expiry, degraded/unavailable status, attendance restart and usable UI verified |
| Windows application lifecycle | IPC and native Windows console Ctrl+C startup/shutdown/restart | Passed, 10 November 2026 | App ports released; existing Ollama preserved; restarted doctor/browser ready; exact OS console-event method below |
| Legacy app | Tracked source/manifests/scripts inventory | Not applicable in this checkout | Separate legacy repository is not present; no legacy runtime checks were run |

## Handoff and rollback

Implementation is complete in small local commits. Browser requests go to gateway; gateway calls attendance/knowledge over authenticated HTTP; only knowledge accesses Ollama. Attendance owns attendance.sqlite and is independent of AI readiness; knowledge owns knowledge.sqlite. Both contain only migration metadata. Automated suites used synthetic temporary workspaces. The owner's later request to perform remaining checks authorized creation of the real ignored .env/runtime directories, selecting the already installed qwen3:4b model and applying temporary app-scoped firewall isolation. No secret is committed or printed. Use the workspace guide for commands; on this PC use the explicit --cpu probe option.

Local acceptance is now evidenced. An expanded process/API inspection found an existing Ollama installation and models that were absent from the earlier tool PATH view; no installation or model download was necessary. Remote CI, Linux and review/merge remain unperformed. No push/rebase/merge, driver update or persistent firewall/global PATH change occurred. Pre-existing PDF moves remain untouched/uncommitted. Do not start MS-001 before the task's review/merge workflow is complete.

The foundation has no production cutover or student data migration. Before merge, discard only this task's changes if needed. After merge, rollback through a reviewed revert of the MS-000 squash commit, preserving any local runtime data separately. Do not use hard reset or force-push on main.

Contracts dependency checkpoint: installed Zod 4.6.7 in its owning package; frozen offline reinstall passed. No endpoint behavior is introduced by this dependency-only commit.

Group 3 contracts: three Vitest tests and contracts lint passed; v1 strict schemas reject extra/private fields and invalid request IDs. Liveness, readiness, model capability and aggregate status have separate schemas. No listener is started by this checkpoint.

Group 3 observability: three Vitest tests and focused lint passed. Request IDs accept only bounded UUIDs; arbitrary headers are replaced. Structured logs use an allowlist and never serialize URLs, identities, bodies, prompts, secrets, headers or raw errors, including at trace level.

HTTP dependency checkpoint: Fastify 5.12.8 installs successfully on pinned Node/pnpm; its manifest and lockfile belong to the technical HTTP helper package. No application endpoint is enabled by this commit.

Bounded HTTP checkpoint: two real-loopback Vitest tests and focused lint passed. Calls have no redirects/retries, bounded streamed responses, content-type checks, deadlines through body reads, and explicit cancellation. Destination validation remains loopback-only.

Observability type correction: full TypeScript checking caught the stdout sink's inferred boolean return type. Its public sink contract is explicitly void; all logging tests and typecheck pass. Prior commits were preserved. Automatic approval review timed out on a grouped Git command; no Git action ran, and the action was retried once using narrowly scoped Git commands.

HTTP server boundary checkpoint: Fastify injection test and focused lint passed. Host/Origin allowlists, constant-time internal-token checks (except liveness), safe errors, bounded request bodies and generated/echoed request IDs are implemented. Startup/shutdown uses loopback and owned IPC/signal hooks. Cold framework loading needed a 15-second test harness deadline; network deadlines remain unchanged. Removed a deprecated redundant logging option; Fastify's built-in logger stays disabled in favor of the tested allowlisted logger.

Attendance database checkpoint: better-sqlite3 13.0.3 failed because Visual Studio C++ tools are absent. Selected 12.11.1 from official registry metadata (Node 24 supported); its Windows prebuilt binary installed and the migration test passed without global tooling changes. Its prebuild-install 7.1.3 transitive deprecation/fs.R_OK warning remains visible, not suppressed. The reviewed native-script allowlist includes only better-sqlite3. Database has migration metadata only; rerun preserves rows, copied/wrong-owner versions fail, and readiness never migrates or creates a missing DB.

Attendance HTTP checkpoint: both service/migration tests and service lint pass. Startup explicitly validates configuration; liveness is dependency-free, readiness requires a service token and a current owned DB, and unimplemented check-in returns standard 404. No student tables or data endpoints exist.

Knowledge dependency checkpoint: its own package pins better-sqlite3 12.11.1; offline workspace installation passed using the already verified native binary. It does not import attendance service source.

Knowledge database checkpoint: its migration/readiness test and lint pass using a distinct filename, application_id and migration owner. Code remains service-owned; no attendance source or DB is imported. Both DBs contain metadata only, and readiness opens existing files without creating/migrating them.

Ollama adapter checkpoint: fake-loopback discovery/probe tests and focused lint pass. Missing configuration/model, stopped runtime, redirects, oversized/invalid responses, timeout, cancellation and cloud-model rejection are covered. Only fixed discovery and explicit probe calls exist; no download route or public chat endpoint. Real Ollama/offline inference remains unrun.

Knowledge HTTP checkpoint: route test, knowledge lint and full workspace typecheck pass. Database readiness stays independent of model availability; internal diagnostics require the token and return only the versioned diagnostic fields. Disconnect cancels discovery, and there is no public chat route. Gateway, kiosk, launcher and task-wide acceptance remain unfinished.

Explicit probe checkpoint: knowledge-owned CLI uses configured model only, fixed prompt, bounded generation, signal cancellation and redacted JSON result. Additional stalled-generation/cancellation test and focused lint pass. This fake-runtime test is not real-model evidence.

Gateway aggregation checkpoint: real-loopback fake-service test and lint pass. Parallel two-second calls use server-owned authentication and validate response service/request IDs. A shared in-flight request and five-second snapshot cache bound fan-out; each response retains its own ID. Ollama loss degrades status, service loss makes it unavailable, and recovery refreshes after cache expiry. No DB imports occur in gateway.

Gateway HTTP checkpoint: both gateway tests and focused lint pass. Production registers only validated build files, with same-origin CSP and camera/microphone disabled. Host/Origin rejection, traversal/private-file rejection and absent future APIs are tested. Health/status remain available when dependencies fail. Development accepts the fixed loopback Vite origin only when explicitly launched with --dev.

Kiosk checkpoints: React/React DOM 19.3.1 installed with a successful frozen offline reinstall. Production build, UI lint and full typecheck pass after correcting a relative schema import. The responsive shell polls only gateway status, clears stale results on failure, offers Begin/back controls, and leaves upcoming feature controls disabled. No remote assets, camera/microphone calls or persistent visitor state. Vite development configuration binds loopback, rejects hostile Host/Origin, protects runtime/config paths and proxies only /api. Browser verification follows with lifecycle tests.

Lifecycle/diagnostics implementation: launcher owns three backend child processes (plus Vite in development), preflights ports, supports Windows IPC and signals, and stops only owned children. Unexpected service loss leaves other services running. Port-conflict unit test and lint passed. Migration orchestration invokes each service's command without importing DB code. Doctor validates configuration and reads bounded gateway status without changing files/models; ready/degraded/stopped-gateway tests and lint pass. Real process integration uses synthetic copied workspaces with isolated .env/runtime directories and installed-dependency links; it never modifies the operator's configuration.

Windows process integration: 25-second lifecycle test and focused lint pass. Three distinct child PIDs, migration rerun/file isolation, real HTTP auth/Host/Origin rejection, missing model, stopped fake Ollama, stopped/restarted attendance, complete owned shutdown/restart and occupied-port preservation verified. Corrected the Host test to use raw HTTP because Node fetch replaced its supplied Host header. A fake runtime proves protocol/failure handling only; real-model gate stays pending.

Workspace command checkpoint: all required command names are wired. pnpm test passes 16 tooling and 19 Vitest tests; full lint, typecheck and production build pass on Windows. Portable validation needed a pnpm.cmd shim inside the existing temporary tool directory for nested pnpm scripts; no global PATH or installed tools changed. Playwright Chromium was downloaded into that same temporary tool directory for browser verification only.

Browser checkpoint: Playwright Chromium production smoke and focused lint pass. Browser routing blocks every non-gateway origin; no such request was attempted. Desktop/mobile screenshots captured, narrow viewport has no horizontal overflow, Begin moves focus, and future controls are disabled. Attendance loss updates status while the page remains usable; gateway loss clears stale readiness. This is browser-network isolation, not a machine firewall or real-model offline test. Existing NO_COLOR/FORCE_COLOR environment warning is informational and was not suppressed.

Desktop and mobile screenshots were visually inspected: status, controls and footer are readable with no clipping. Additional command checks cover the development proxy/file boundary and Windows CLI shutdown path; fixtures now copy the same TypeScript configuration used by the real development server.

Command integration checkpoint: pnpm test:integration passes all three tests (two files, approximately 30 seconds), including four-process development startup, gateway proxy, protected .env access, and CLI IPC shutdown with all three backend ports released. Focused lint passes. Physical terminal Ctrl+C remains a manual check; IPC exercises the same owned-child shutdown routine on Windows.

CI checkpoint: added read-only Windows/Ubuntu verification workflow for frozen install, toolchain, lint, unit tests, typechecked build, process integration and Chromium smoke. No real model or credentials are required; checkout does not persist credentials. Workflow input/version syntax was checked against [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), and [pnpm action-setup](https://github.com/pnpm/action-setup) documentation. Workflow execution and Linux behavior remain unverified because no push was authorized or performed.

## Final local verification — 10 November 2026

- Fresh temporary copy began without node_modules, generated configuration, databases or build output. `pnpm install --frozen-lockfile --offline` reused 223 packages with zero downloads, including the cached working SQLite native build. Lockfile SHA256 stayed `9b8bb9a8b40cd8d1e0ac7251f8189c6894ae72960ea0a7ec3d14795e227c0be5`.
- In that copy, `pnpm lint`, `pnpm test` (16 tooling + 19 unit), `pnpm build` (including full typecheck), `pnpm test:integration` (3), and `pnpm test:e2e` (1) all passed. Total: 39 automated tests, none skipped. Tests create only synthetic temporary data; the copy and its generated fixtures were cleaned up afterward.
- Native Windows x64 used Node 24.22.2/pnpm 10.34.9 and Playwright Chromium 158.0.8127.18. Desktop 1280×900 and mobile 390×844 browser screenshots were inspected. Browser external requests were blocked, not the entire machine network.
- Git/docs audit passed: all 13 pre-existing moved PDFs match their original Git blob hashes; 19 local Markdown links/anchors resolve; workflow YAML parses with read-only permissions and Windows/Ubuntu matrix; main remains `ccf3c34bcd69a0bfc0ea82522951d7903492c223`. No runtime/config/model/build output is committed. Unrelated PDF moves remain unstaged.
- Implementation choice: all three entrypoints validate the common bootstrap configuration before binding. This schema remains a technical helper; no domain configuration or service/database model is shared. Future domain configuration belongs to its service. Startup does not migrate, and launcher never starts Ollama or downloads models.
- Limits: no real installed Ollama/model was available, so actual offline generation is unrun. Physical terminal Ctrl+C, Linux and remote CI are unrun. Existing native-package deprecation and browser color-environment warnings remain visible. MS-000 is not marked fully accepted until its remaining manual gates are evidenced.

## Real-machine acceptance follow-up — 10 November 2026

This follow-up supersedes the earlier pending real-model and console-interrupt notes above. The owner explicitly requested that the remaining setup/checks be performed.

- Reused existing Ollama **0.32.5**, listening only at **127.0.0.1:11434**, with `/api/status` reporting cloud disabled from its environment. Reused **qwen3:4b**, **4.0B/Q4_K_M/GGUF**, approximately **2.50 GB**, with an Apache license. Digest: `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`. No runtime/model download, model replacement or daemon restart was needed.
- Hardware: **25,459,286,016 bytes RAM** (about 23.7 GiB), NVIDIA **GeForce RTX 4050 Laptop GPU**, **6141 MiB VRAM**, driver **546.18**. The existing CUDA runner failed with HTTP 500 / `device kernel image is invalid`. Explicit `num_gpu: 0` succeeded; no driver update was attempted.
- Commit `b854f83` adds `pnpm ollama:probe --cpu`, retaining automatic mode by default. CPU selection affects only the developer's fixed diagnostic request; it is not automatic retry/fallback. Both modes bound context to 4096 tokens and generated output to eight tokens. Results identify CPU versus automatic selection without exposing content. All four knowledge tests, focused lint and full typecheck passed; full workspace lint also passed after excluding generated, Git-ignored .tools artifacts.
- Generated the ignored real workspace .env with setup:local, selected qwen3:4b without printing the token, validated configuration, and migrated both owned metadata-only DBs. .env.example remains blank and unchanged. Doctor reported all four components ready on the restarted real application.
- Final isolated run: **2026-11-11 00:54:36–00:55:01 UTC** (10 November local time). Three temporary outbound blocking rules covered the test Node executable, existing Ollama executable and its llama-server runner; all non-loopback IPv4/IPv6 destinations were blocked. A controlled outbound TCP connection succeeded before isolation, failed during it, and succeeded after cleanup. All three rules were confirmed active during the run and **zero remained afterward**. Machine network adapters and unrelated applications were not disconnected; a timed cleanup helper provided backup removal of only the unique test rules.
- Under that isolation, the configured real-model CPU probe returned **ok:true in 1515 ms**. Doctor reported **state:ready** with all four components ready. A fresh Chromium context loaded the real production kiosk at **http://127.0.0.1:3000**, showed ready status, and verified disabled future controls. Browser routing blocked all non-gateway requests; **zero external browser requests** occurred. The resulting screenshot was visually inspected. An initial browser-harness path initialization error was corrected before this successful run; it was not reported as a pass.
- Console check: the tool pseudo-terminal interrupt was inconclusive, so only its verified test-owned processes were cleaned up. A separate Windows PowerShell console running pnpm start then received native **CTRL_C_EVENT** through AttachConsole/GenerateConsoleCtrlEvent. Ports **3000/3001/3002** closed while existing Ollama remained listening. Restart succeeded without port conflicts and doctor/browser reported ready. This tests the Windows console control event, not a simulated JavaScript signal or human keypress.
- Remaining limitations: automatic GPU generation fails with the current external runtime/driver combination; use --cpu for this diagnostic. Linux and remote CI remain unrun, and no push/merge/deployment occurred. The foundation still exposes no visitor data or general-purpose model proxy.
