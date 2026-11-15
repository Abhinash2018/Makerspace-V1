# Local setup and offline operating contract

Status: MS-000 implementation, automated Windows checks, real CPU inference under application-scoped outbound firewall isolation, and Windows console Ctrl+C/restart checks pass. Linux/remote CI has not run; no deployment or real visitor workflow is enabled.

Project documentation lives in root `docs/`. Use the `local/` workspace and [its command guide](../local/README.md). Tested pins include Node `24.22.2`, pnpm `10.34.9`, TypeScript `5.9.3`, Fastify `5.12.8`, Zod `4.6.7`, better-sqlite3 `12.11.1`, React/React DOM `19.3.1`, Vite `8.3.7`, Vitest `5.1.0`, Playwright `1.65.0` and ESLint `10.14.0`. All package versions are fixed in manifests and the lockfile.

Baseline inspection found machine Node `25.8.1` and npm `11.11.0`; pnpm and Ollama were not found on PATH. Validation used checksum-verified portable Node/pnpm tools in Windows temp, with PATH changes scoped to the checking processes. The machine-wide tools and settings remain unchanged. Ask before machine-wide installation or configuration changes. A tooling check does not establish application or real-model readiness.

## One-time setup versus daily operation

One-time setup needs Node, pnpm, Git for development, project dependencies, Ollama, and downloaded model files. Internet is normally used for those downloads; a prepared offline installation bundle is a later task. Playwright browser downloads are development prerequisites, not kiosk runtime requirements.

Daily operation must use local files and services only. No cloud credentials, remote fonts, CDN scripts, hosted database, license-check API, web search, remote speech API, or hidden provider fallback may be required by the new application. Disable optional telemetry where supported. A local Ollama URL alone does not establish local inference: explicitly disable its cloud features and select a downloaded local model.

## Ollama configuration

Install Ollama using its official instructions for the target OS. Keep its listener on `127.0.0.1:11434`. Configure `OLLAMA_NO_CLOUD=1` in the environment of the **Ollama process**, or set `"disable_ollama_cloud": true` in Ollama's existing `~/.ollama/server.json` configuration. Merge that setting; do not overwrite unrelated settings. Restart Ollama for configuration changes to apply.

Putting a setting only in the application's `.env` does not change an already-running Ollama desktop/background process. Verify the actual process configuration and local-only behavior. See the [official FAQ](https://docs.ollama.com/faq).

Before disconnecting the internet, choose an available local chat model that fits the PC, download it explicitly with `ollama pull MODEL_NAME`, and check `ollama list`. Replace `MODEL_NAME` with the chosen exact model name; it is a placeholder, not a literal command to copy unchanged. Record its digest, quantization, license, model size, Ollama version, and host RAM/GPU. Do not select a cloud model. A local embedding model will be selected and downloaded when the retrieval task is implemented.

No particular RAM/GPU or model was verified for this project during document preparation. Start with a model appropriate to the actual machine and measure. Missing hardware information must not block creating the foundation: tests use fake Ollama responses and the UI can show degraded status until a real model is configured.

## Application configuration

The committed non-secret `local/.env.example` contains these values:

```dotenv
APP_HOST=127.0.0.1
GATEWAY_PORT=3000
ATTENDANCE_PORT=3001
KNOWLEDGE_PORT=3002
ATTENDANCE_URL=http://127.0.0.1:3001
KNOWLEDGE_URL=http://127.0.0.1:3002
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL=
INTERNAL_SERVICE_TOKEN=
RUNTIME_DIR=.runtime
LOG_LEVEL=info
```

`setup:local` reads `.env.example`, generates a cryptographically random 32-byte internal token encoded as 64 hexadecimal characters, creates service runtime directories, and writes ignored `.env` using exclusive creation. It refuses to replace existing config or keys and never prints the token. Generation uses the example rather than ambient environment overrides. It does not pull models, contact Ollama, or create databases. Existing runtime contents are preserved. Filesystem failures can leave empty directories; inspect the failure without deleting existing data or forcing config replacement.

Run `pnpm config:check` after editing `.env`. Known process environment values override file values; missing non-secret keys use defaults. Blank invalid values fail. The loader does not mutate `process.env` or write files. `.env` must be a regular file of at most 16 KiB with unique supported single-line assignments; comments, CRLF, and quoted single-line values are supported. Unknown keys, duplicate assignments, and multiline values fail. Errors include fixed guidance and field names, never supplied values or stack traces.

Validation requires literal `127.0.0.1` for binding and service/model HTTP origins. Hostname aliases, IPv6, credentials, URL paths/query/fragment, and cloud-tagged model names are rejected. Service URL ports must match their listener settings; gateway, attendance, knowledge, Vite (5173), and Ollama ports must all differ. The HTTP adapter rejects redirects and bounds time/body size; configuration validation itself makes no network requests.

`RUNTIME_DIR` resolves relative to the local workspace root, not the process's arbitrary current working directory, and must remain within its ignored `.runtime/` tree. Attendance and knowledge use distinct subdirectories. Existing symlink/junction components and file collisions are rejected. Setup requests modes `0600` for `.env` and `0700` for directories; Windows ACL inheritance is unchanged, and owner-only Windows permissions have not been established by these tests.

An empty model is valid and produces `model_not_configured`. Model discovery runs only in knowledge and uses a two-second deadline; gateway snapshots are cached for five seconds. The explicitly invoked chat probe allows up to 120 seconds for cold loading, has bounded output and supports cancellation. Configuration validation does not establish model installation, listener readiness, filesystem writability, or offline inference. The application's `.env` never configures the separate Ollama daemon.

## Setup sequence

From `local/`, install dependencies using the committed lockfile, run `pnpm setup:local`, configure the downloaded model in `.env`, and run `pnpm db:migrate`. Start Ollama once using its installed application/service, then start `pnpm dev` for development or `pnpm build` followed by `pnpm start` for the production-style local run.

You can leave the model blank and start the shell without Ollama. Each migration command creates only its owner's migration metadata and can be rerun safely. Startup never migrates automatically or recreates a DB. Do not run setup again over an existing .env. The launcher reports occupied ports without terminating existing processes and leaves Ollama under operator control. Ctrl+C requests graceful owned-child shutdown, with an owned-process fallback after five seconds. Windows IPC and native console-event shutdown/restart are verified.

The later real-machine check also delivered Windows `CTRL_C_EVENT` to a dedicated PowerShell console running `pnpm start`: all three app ports closed, Ollama stayed running, and restart succeeded. The tool's pseudo-terminal interrupt was inconclusive; the dedicated-console result is the recorded evidence, not a claim that a human pressed a key.

Production browser address: `http://127.0.0.1:3000`. Development UI: `http://127.0.0.1:5173`, with the development proxy forwarding `/api` to port 3000. Use the project's origin allowlist for these exact origins.

Run `pnpm doctor` and `pnpm ollama:probe` for setup diagnosis. The probe calls the knowledge adapter from a local CLI, not from a visitor-accessible chat route. If Ollama is already active, do not launch another copy or kill the existing process. Show a useful message on port conflicts.

For this machine's installed Ollama 0.32.5 and NVIDIA driver 546.18, the CUDA runner returns HTTP 500 with `device kernel image is invalid`. Use `pnpm ollama:probe --cpu` for the verified CPU diagnostic path. This explicitly sends `num_gpu: 0`, with 4096-token context and eight-token output bounds, for that request only. Automatic mode remains available on compatible drivers; no driver update or persistent daemon change was made. qwen3:4b (Q4_K_M, Apache license) was already installed and passed without downloading a model.

Doctor exits 1 for degraded/unavailable and 0 only for all-ready. Model failure does not make attendance/knowledge DB readiness fail. A stopped internal service leaves the gateway UI/status readable. Status may take five seconds to refresh; the browser polls every five seconds, so allow about ten seconds to observe recovery. Service restart is explicit; the launcher is not a production supervisor.

## Local staff access (MS-001)

From `local/`, run `pnpm staff:provision` in an interactive terminal after `setup:local`. Enter the same private password twice when prompted. Input is masked, never accepted as an argument or redirected stdin, and is not written to `.env`. Use 15–128 characters (at most 512 UTF-8 bytes, without NUL); spaces are preserved. There is no default password, remote identity provider, public signup, or university SSO. This initial task supports one local staff account.

The command exclusively creates `<RUNTIME_DIR>/gateway/staff-credential.json` with a salted scrypt hash. It refuses to replace any existing file. Only the gateway reads it, at startup. Restart the gateway after provisioning. Without a credential, kiosk and status still work and staff login reports unavailable. A malformed, oversized, unsupported or symlinked credential path prevents gateway startup; repair the file/path rather than deleting data to suppress the failure. No real credential is provisioned by automated tests.

To reset a forgotten password, stop the gateway, privately back up and move the existing credential file at the operator's direction, run provisioning again, then restart. No credential can be reset through a browser route. Restart invalidates every browser session. Unix file/directory modes 0600/0700 are requested; Windows ACL inheritance is unchanged. Protect the workstation account and its private runtime directory. Do not commit credentials, runtime databases, environment files or generated output.

Browser access uses a host-only HttpOnly/SameSite=Strict cookie, a separate in-memory CSRF token, and exact loopback Origin/Host checks. Kiosk sessions expire after two idle minutes or thirty total minutes; staff sessions after fifteen idle minutes or eight hours. Polling does not refresh activity. All sessions are process-memory state, so gateway restart signs everyone out. Cookies are scoped to the loopback host, not a port; other software under the same local OS account is outside this security boundary. Initial plain HTTP has no Secure-cookie guarantee. LAN/HTTPS is MS-009.

All loopback callers share fixed limits: 240 API requests, 20 session creations/resets and 5 login attempts per minute. The response includes Retry-After when limited. Password verification allows one 128 MiB scrypt operation at a time, with a 192 MiB maximum allocation setting; a concurrent attempt receives a retry response. A local client can exhaust shared limits; they are bounds on work, not protection from a compromised local account. Staff credentials and request bodies never enter logs or Ollama prompts.

## Manual check-in and visit retention (MS-002)

Before running new check-in code over the foundation, stop the app, preserve any existing data with a SQLite-safe backup, and run `pnpm db:migrate` explicitly. Attendance appends migration 2 to the known migration-1 database; it never deletes/recreates that database or migrates on startup. Unknown/future/foreign layouts fail closed. This implementation's development tests do not migrate the operator's real DB.

Begin a visitor session, select Check in, enter the name and NetID, and submit. Names are bounded Unicode self-reports; NetIDs are trimmed/lowercase ASCII letters/digits beginning with a letter, 2–32 characters. These are project input bounds, not university account verification. The confirmation is shown only after the attendance transaction commits and contains no submitted identity. Check-in does not authorize equipment use, unlock a door, measure occupancy, take a photograph or send identity to Ollama. Knowledge/model availability does not gate attendance.

If confirmation is lost or a dependency is unavailable, the UI locks the attempt's details and offers Retry same check-in. That explicit retry reuses its UUID and returns the original receipt if it already committed. There is no automatic retry or browser queue. Starting a new attempt is explicit and may record a second visit if an earlier request succeeded. Finish/back/session expiry clear visitor fields and attempt state; a new session has a fresh attempt namespace. Ten authenticated check-in attempts/minute share a gateway-wide limit within the existing API quota.

Visits and their attempt/payload digests use the existing project default of 30 days. This is not an institutional retention-policy approval. Attendance removes rows at or before the UTC cutoff at startup, hourly while running and before new writes. `pnpm attendance:cleanup` performs the same cleanup explicitly, with no arguments, and prints only the count. A cleanup failure is a fixed redacted maintenance event and makes readiness unavailable until a later successful sweep/write or restart. A stopped service cannot run cleanup; run the explicit command or restart after downtime. MS-005 must also filter expiry on reads; MS-010 owns operational scheduling/backup retention.

Row deletion is logical retention, not guaranteed erasure from SSDs, WAL files, backups or external copies. Owned SQLite connections enable secure-delete; backups and copies require their own lifecycle. Cleanup is an indexed transaction with a one-second lock wait; its execution time depends on expired row count. No production load target or physical-erasure guarantee is claimed. Do not revert to migration-1-only code over a version-2 DB or delete the DB to make readiness green. Rollback requires a reviewed migration/data plan and a SQLite-safe backup.

## Approved document ingestion (MS-003)

Stop services and preserve a SQLite-safe backup before `pnpm db:migrate`. Knowledge migration 2 appends owned document/version/index tables; startup never migrates or creates a missing database. Development acceptance uses disposable synthetic databases and never migrates your operator DB.

Use an already installed local embedding model. Embedding and chat settings are separate; no command below pulls a model. With Ollama bound to loopback and cloud disabled, run from `local/`:

```sh
pnpm knowledge configure --model embeddinggemma:latest
pnpm knowledge status
pnpm knowledge ingest --approved --key workshop-policy --title "Workshop policy" --file "C:/approved/policy.pdf"
pnpm knowledge status
pnpm knowledge reindex
```

`--approved` means the local operator has reviewed and approved that specific PDF; omit it and ingestion refuses before reading/copying the source or calling a model. The example path is illustrative, not a bundled policy. No documents are imported by startup. There is no browser upload or question endpoint yet. Regular local text PDFs only: no UNC/URLs/symlinks, passwords or OCR; at most 10 MiB and 100 pages. Empty/image-only input fails, and blank pages of partially text-bearing files are reported explicitly. Worker extraction has a ten-second limit; an import/reindex operation has a five-minute cancellation deadline. Cancellation/failure preserves active DB evidence; a pre-commit crash can leave an inactive source orphan.

Configuration exclusively creates `<RUNTIME_DIR>/knowledge/embedding-settings.json`; repeating configure never overwrites it. A missing file disables ingestion, and a corrupt/symlinked file refuses startup. To change models/prefixes, stop knowledge, back up the settings/DB/private sources and explicitly edit the private JSON using the documented fields in [MS-003](tasks/MS-003-document-ingestion.md). Restart validation then run reindex. EmbeddingGemma defaults to CPU, document prefix `title: none | text: ` and query prefix `task: search result | query: `. Reindex uses only previously approved digest-named private PDFs; it cannot import a new external path. Existing versions and old model indexes are preserved. A changed setting/model digest requires its own complete compatible index; status must report `complete:true` before later retrieval can use it.

Knowledge owns `knowledge.sqlite` and `sources/<sha256>.pdf`. Keep them private, backed up together and out of Git/web roots. Limits: 50 document keys, ten immutable versions/key, four index identities, 5,000 current chunks/index and 20,000 stored chunks total. Exhaustion refuses work rather than deleting history. Source/title changes create a version; repeats preserve the current version. Concurrent preparations use version/snapshot checks. Do not remove rows/files or reset the DB to bypass quotas; MS-010 handles reviewed lifecycle/backup operations. File mode requests do not replace Windows ACL management. PDF worker limits are resource guards, not an OS malware sandbox.

`pnpm knowledge:acceptance --cpu` explicitly runs a synthetic real-model acceptance probe using the already installed `embeddinggemma:latest` and disposable storage. Ordinary test suites use fake loopback providers and synthetic PDFs; Python is not required. Google Gemma license applies to EmbeddingGemma; institutional corpus/model approval is separate. This task does not establish real-policy grounding quality, which belongs to MS-004.

## Offline verification

1. Complete dependency/model installation and production build while setup access is available.
2. Block external network access while keeping loopback active. Reopen the production UI with a fresh browser context so an old CDN cache cannot hide dependencies.
3. Check local assets, fonts, API/status requests, and the harmless local generation probe. Record external connection attempts, if any. Separately distinguish OS/Ollama update traffic from application traffic; local-only inference settings do not necessarily disable all software update checks.
4. Stop Ollama and confirm degraded AI status without gateway/attendance failure. Restart and verify recovery without downloading anything.
5. Record exact steps, hardware, model/digest, result, and limitations in MS-000. A mocked CI pass is not a real offline model test.

For later voice: Ollama is not the entire speech pipeline. Use a local speech-to-text runtime/model and a local text-to-speech engine or verified installed offline voice. Do not assume browser speech recognition is offline. For later face matching: bundle models locally and preserve consent; never send face data to the language model.

## Troubleshooting expectations

| Symptom | Check |
| --- | --- |
| Ollama unreachable | Process running, loopback listener, configured port, deadline |
| Model missing | Exact installed model name/digest; perform downloads only during deliberate setup |
| Slow first response | Cold load, RAM/VRAM, model size and context; measure before changing architecture |
| Internal 401 | Generated service token loaded by all local services; never print token in logs |
| DB unready | File permissions, migration version, disk availability; do not delete DB to hide errors |
| iPad cannot connect | Initial setup is loopback-only by design; LAN support is a separate feature |

## Before real operation

MS-000 is a development foundation. Later tasks add access controls, retention, backups and restore verification, process supervision/restart, approved document answers, and actual device tests. Each is tracked separately; do not label the initial shell production-ready.
