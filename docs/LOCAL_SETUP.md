# Local setup and offline operating contract

Status: instructions for the MS-000 implementer to turn into a tested runbook. Application commands below do not exist until MS-000 is implemented. Target: native Windows first; document Linux support separately when tested.

## One-time setup versus daily operation

One-time setup needs Node, pnpm, Git for development, project dependencies, Ollama, and downloaded model files. Internet is normally used for those downloads; a prepared offline installation bundle is a later task. Playwright browser downloads are development prerequisites, not kiosk runtime requirements.

Daily operation must use local files and services only. No cloud credentials, remote fonts, CDN scripts, hosted database, license-check API, web search, remote speech API, or hidden provider fallback may be required by the new application. Disable optional telemetry where supported. A local Ollama URL alone does not establish local inference: explicitly disable its cloud features and select a downloaded local model.

## Ollama configuration

Install Ollama using its official instructions for the target OS. Keep its listener on `127.0.0.1:11434`. Configure `OLLAMA_NO_CLOUD=1` in the environment of the **Ollama process**, or set `"disable_ollama_cloud": true` in Ollama's existing `~/.ollama/server.json` configuration. Merge that setting; do not overwrite unrelated settings. Restart Ollama for configuration changes to apply.

Putting a setting only in the application's `.env` does not change an already-running Ollama desktop/background process. Verify the actual process configuration and local-only behavior. See the [official FAQ](https://docs.ollama.com/faq).

Before disconnecting the internet, choose an available local chat model that fits the PC, download it explicitly with `ollama pull MODEL_NAME`, and check `ollama list`. Replace `MODEL_NAME` with the chosen exact model name; it is a placeholder, not a literal command to copy unchanged. Record its digest, quantization, license, model size, Ollama version, and host RAM/GPU. Do not select a cloud model. A local embedding model will be selected and downloaded when the retrieval task is implemented.

No particular RAM/GPU or model was verified for this project during document preparation. Start with a model appropriate to the actual machine and measure. Missing hardware information must not block creating the foundation: tests use fake Ollama responses and the UI can show degraded status until a real model is configured.

## Application configuration to implement

Create a non-secret `.env.example` with documented values:

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

`setup:local` copies defaults into ignored `.env`, generates a cryptographically random internal token, and creates private runtime directories. It refuses to replace existing config or keys. It does not pull models. An empty model setting produces an explicit `model_not_configured` capability state rather than failing the whole app. Reject non-loopback service/model URLs in this initial deployment and do not follow redirects to other hosts.

Resolve `RUNTIME_DIR` relative to the local workspace root, not the process's arbitrary current working directory. Use service-specific subdirectories. Avoid file permission claims that were not tested on Windows.

## Setup sequence after implementation

From `local/`, install dependencies using the committed lockfile, run `pnpm setup:local`, configure the downloaded model in `.env`, and run `pnpm db:migrate`. Start Ollama once using its installed application/service, then start `pnpm dev` for development or `pnpm build` followed by `pnpm start` for the production-style local run.

Production browser address: `http://127.0.0.1:3000`. Development UI: `http://127.0.0.1:5173`, with the development proxy forwarding `/api` to port 3000. Use the project's origin allowlist for these exact origins.

Run `pnpm doctor` and `pnpm ollama:probe` for setup diagnosis. The probe calls the knowledge adapter from a local CLI, not from a visitor-accessible chat route. If Ollama is already active, do not launch another copy or kill the existing process. Show a useful message on port conflicts.

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
