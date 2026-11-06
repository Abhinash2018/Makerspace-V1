# Local Makerspace workspace

The MS-000 implementation provides a local kiosk, three independent services, owned SQLite migration tracking, and Ollama diagnostics. Automated Windows checks, real local CPU inference with application outbound networking blocked, and Windows console Ctrl+C shutdown/restart pass. No visitor data feature is enabled; Check in and Ask are visibly upcoming. Remote CI/Linux has not run.

Read root [AGENTS.md](../AGENTS.md), [the task and commit order](../docs/tasks/MS-000-foundation.md), [architecture](../docs/architecture/ARCHITECTURE.md), and [Git workflow](../docs/GIT_WORKFLOW.md) before editing. Project documentation stays in root `docs/`.

## Toolchain and available commands

Use Node **24.22.2** and pnpm **10.34.9**. The Node pin lives in `.node-version` and `package.json`; pnpm is pinned in `packageManager` and `engines.pnpm`. Install through an approved version manager or portable distribution, or request approval before a machine-wide installation. The workspace does not install or switch tools automatically. Consult [Node downloads](https://nodejs.org/en/download) and the [pnpm 10 installation guide](https://pnpm.io/10.x/installation); use the exact pins above rather than an unversioned latest install.

From `local/`, using those versions:

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check:toolchain
pnpm setup:local
pnpm config:check
pnpm db:migrate
pnpm build
pnpm start
```

Open `http://127.0.0.1:3000`. For development, stop the production launcher and use `pnpm dev`, then open `http://127.0.0.1:5173`. Both commands stop their owned child processes on Ctrl+C; neither starts, stops or downloads Ollama. A port conflict fails without killing its owner. If a child service exits later, other services stay running and status changes after the five-second cache expires. There is no automatic process restart.

In a second terminal, `pnpm doctor` reports configuration, service/DB readiness and model availability through the gateway. Exit 0 means all components ready; degraded/unavailable exits 1. `pnpm ollama:probe` explicitly runs a fixed harmless generation request and reports model/digest/duration without generated content. It works independently of the launcher, requires a configured installed local model, and never downloads one.

On this PC, use `pnpm ollama:probe --cpu`: the installed Ollama 0.32.5 CUDA runner fails with `device kernel image is invalid`, while qwen3:4b succeeds on CPU. This option applies only to the explicit diagnostic request; it does not change drivers, daemon settings or enable an automatic fallback. Doctor checks availability, not successful GPU inference. The probe bounds context to 4096 tokens and reports whether CPU was explicitly selected.

Developer verification (build first for integration/browser tests):

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright browser installation is a one-time development prerequisite. On Linux runners, use `pnpm exec playwright install --with-deps chromium`. The runtime does not require Playwright or network access after dependencies, build assets and any selected model are installed.

`check:toolchain` rejects the wrong Node version, mismatched manifest pins, and the wrong package manager when invoked through a package-manager script. The same guard runs during installation. Direct `node scripts/check-toolchain.mjs` verifies Node and pin consistency; use `pnpm check:toolchain` to also verify the active pnpm. A missing pnpm command means the prerequisite still needs installing through your approved method.

`lint` checks JavaScript and TypeScript and fails on warnings. `typecheck` checks tooling, services, UI and tests without emitting output. Node 24 runs backend TypeScript directly; Vite bundles the kiosk. `test` runs 16 Node tooling tests and 19 Vitest unit tests. `test:integration` runs three real-process checks in synthetic temporary workspaces; `test:e2e` launches a production fixture in Chromium and blocks non-gateway browser requests. Tests do not use your workspace .env or runtime DBs. CI defines Windows and Linux jobs; remote execution/Linux validation have not yet occurred.

## Local configuration

Run `pnpm setup:local` once. It reads the committed `.env.example`, creates ignored `.env` with a random 32-byte token encoded as 64 hexadecimal characters, and creates `.runtime/attendance/` and `.runtime/knowledge/`. It does not use ambient environment overrides during generation, print the token, create databases, contact Ollama, or download anything. An existing `.env` of any kind causes a nonzero exit and is preserved. Concurrent setup attempts cannot replace the first file. Existing runtime contents are preserved; a failed filesystem operation may leave empty directories for manual inspection.

Edit `.env` manually, then run `pnpm config:check`. The checker requires a regular `.env` file, merges known process environment overrides over file values, and validates without changing the process environment or files. Missing non-secret settings use documented defaults. Blank settings are validated as supplied; a blank token fails. An empty model is valid and reported as not configured. This command checks configuration only, not service, database, port availability, model installation, or offline inference readiness.

The initial deployment accepts only literal `127.0.0.1` and HTTP origins without credentials, paths, queries, or fragments. Update a service port and its URL together. All service, Ollama, and development UI ports must differ; Vite is reserved at 5173. `RUNTIME_DIR` resolves from this workspace even when invoked elsewhere and must remain inside its ignored `.runtime/` tree. Symlinks/junctions and file collisions in runtime directory paths are rejected. Setup requests file/directory modes `0600`/`0700`; Windows inherits ACLs, and no owner-only Windows permission guarantee is claimed.

The `.env` format accepts unique supported `KEY=value` assignments on single lines, quoted single-line values, comments, and CRLF. Unknown keys, duplicates, multiline values, and files larger than 16 KiB fail. Do not put Ollama daemon settings here: configure `OLLAMA_NO_CLOUD` on the separately running Ollama process as explained in [local setup](../docs/LOCAL_SETUP.md#ollama-configuration). Blank model configuration is valid and produces `model_not_configured`. Discovery verifies the configured installed model; the explicit probe checks generation. Health never triggers generation or downloads.

## Contributor boundaries

- `apps/kiosk/`: React shell and same-origin gateway status polling; no DB or direct model calls.
- `services/gateway/`: static assets and bounded status aggregation; no database access.
- `services/attendance/`: independent authenticated readiness and attendance.sqlite migration metadata.
- `services/knowledge/`: independent DB readiness, knowledge.sqlite metadata and backend-only model diagnostics.
- `packages/contracts`, `packages/http`, `packages/observability`: schemas and small technical helpers; no domain/DB models.
- `packages/config/`: Node-only environment parsing and validation helpers; no domain services or database models.
- `scripts/`: toolchain/configuration checks and non-overwriting local setup.

Each service can also run independently: `pnpm --filter @makerspace/attendance start`, `pnpm --filter @makerspace/knowledge start`, or `pnpm --filter @makerspace/gateway start`. Stop the combined launcher first to avoid port conflicts. Internal routes require the generated token except `/health/live`; the browser only uses gateway routes. Attendance and knowledge readiness depend on their own DB, independently of Ollama. Each service validates configuration at startup through the common technical parser; no domain configuration exists yet.

Dependencies are pinned in their owning packages and lockfile. Only `better-sqlite3` is allowed to run its native build script. Version 12.11.1 used its Windows Node 24 prebuilt binary here; a platform without a compatible prebuilt may need that platform's native build tools. The transitive prebuild-install deprecation warning remains visible. See [pnpm workspace settings](https://pnpm.io/10.x/settings).

Root `.gitignore` excludes local environment files, runtime databases, installed dependencies, model weights, generated builds, reports, and temporary tooling. ESLint also excludes the ignored `.tools/` directory containing local verification artifacts, alongside other generated/runtime directories. `.env.example` is committed with its token blank. Root `.gitattributes` keeps source/document text at LF and PDFs/images/fonts binary; it does not change Git's machine-wide configuration.

## Verification at this checkpoint

Native Windows lint, typecheck, unit, process integration, Chromium smoke and production build pass. Real qwen3:4b inference also passed with temporary outbound firewall rules on Node, Ollama and its model runner; loopback stayed available and all rules were removed. Windows console Ctrl+C was delivered through the OS console API, followed by port-release and restart checks; no manual keyboard press is claimed. Existing Ollama/models were reused and no drivers/global PATH settings changed. Remote CI/Linux remains unrun. Exact evidence is in [MS-000](../docs/tasks/MS-000-foundation.md#evidence-to-fill-during-implementation).
