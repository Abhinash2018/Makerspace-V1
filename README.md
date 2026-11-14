# Makerspace Assistant — local-first foundation

Prepared for Abinash Ghimire • 6 November 2026

## Current status

MS-002 manual check-in is implemented and locally verified on `feat/MS-002-manual-checkin`: self-reported name/NetID visits, transactional idempotent retries, protected HTTP routing, a transient kiosk form and 30-day project retention. All 80 automated tests, lint, typecheck and the production build pass in the offline-installed verification copy; screenshots were reviewed. A lost successful reply was retried to the same receipt with exactly one stored visit. Knowledge/model failure does not block attendance. See [MS-002](docs/tasks/MS-002-manual-checkin.md) and the [operator migration/retention runbook](docs/LOCAL_SETUP.md#manual-check-in-and-visit-retention-ms-002). No operator DB was migrated and no push/deployment occurred.

MS-001 local access controls are implemented and locally verified on `feat/MS-001-access-controls`: staff provisioning/sign-in/sign-out, automatic kiosk sessions, CSRF/Origin/role checks, session expiry/revocation and bounded request/login work. All 61 automated tests, lint, typecheck and production build pass in an offline-installed temporary copy; Chromium desktop/mobile screenshots were reviewed. The working checkout's pre-existing dependency tree is incomplete and unrelated staged runtime/dependency files are preserved. Use [MS-001 evidence](docs/tasks/MS-001-access-controls.md) for exact checks and limits. Grouped local commits are authorized; no push/deployment has occurred.

MS-000 implementation and local Windows acceptance checks are complete on `chore/MS-000-local-foundation`: kiosk, gateway, attendance/knowledge skeletons, owned SQLite migrations, Ollama diagnostics, launcher, doctor and CI. A fresh cached install passed 39 automated tests, lint, typecheck and build. Real qwen3:4b CPU inference, doctor and kiosk passed with application outbound networking blocked; Windows console Ctrl+C released app ports and restart succeeded. Use `pnpm ollama:probe --cpu` on this PC because its installed CUDA runner crashes. Remote CI/Linux and review/merge remain separate; nothing has been pushed or merged. See [the workspace guide](local/README.md) and [task evidence](docs/tasks/MS-000-foundation.md).

The project will provide a touch-first Makerspace kiosk: check-in, questions answered from approved documents, optional face check-in, and protected staff history. Ollama will generate answers locally. Internet access, cloud accounts, paid APIs, and external databases must not be required during ordinary operation after installation.

“Local” still means running software: a browser, several small backend processes, and the Ollama process on the Makerspace PC. An iPad can later use that PC over a local network; the iPad does not run this backend itself.

## Start here

1. Read [the initial task](docs/tasks/MS-000-foundation.md).
2. Read [the architecture and drawings](docs/architecture/ARCHITECTURE.md).
3. Follow [the Git workflow](docs/GIT_WORKFLOW.md).
4. Use [the offline setup contract](docs/LOCAL_SETUP.md) when implementing setup.
5. For the next feature, copy [the task template](docs/tasks/TEMPLATE.md) into a new task file on its feature branch.

Use the current [task index](docs/tasks/INDEX.md) and `AGENTS.md` for active scope. The following original MS-000 prompt is retained as historical foundation context:

> Read `AGENTS.md`, `README.md`, `docs/architecture/ARCHITECTURE.md`, `docs/LOCAL_SETUP.md`, `docs/GIT_WORKFLOW.md`, and `docs/tasks/MS-000-foundation.md`. Inspect the repository first. Implement only MS-000 on `chore/MS-000-local-foundation`, with runtime code under `local/`. Preserve existing files and Git history. Use the task's ordered commit groups, with relevant checks and evidence at each step. Ask before creating or switching branches, committing, pushing, rebasing, merging, deleting files/branches, or changing machine-wide settings. Build a runnable local foundation, test it, and record actual results in the task file. Explain the service boundaries and commands in plain language. Do not implement the future backlog or claim a push, merge, hardware test, or offline test happened unless it actually did.

## Repository layout and earlier application

This checkout is the separate `Abhinash2018/Makerspace-V1` repository. At baseline `ccf3c34`, it contains root `AGENTS.md`, this README, and `docs/`, including the reference PDFs. It has no application source, dependency manifests, or runnable scripts. Keep these documents at their existing paths and add the runtime workspace under `local/`. Run application commands from `local/`; future CI belongs in root `.github/workflows/`. See the task's baseline and commit plan before implementing.

The original specification records a source/document review of the separate [MakerspaceAssistant repository](https://github.com/Abhinash2018/MakerspaceAssistant) on 6 November 2026 at commit `ad50c184b3e4914e01e00e6eb862bc26fec3e0a9`. That application is historical reference; it is not present in this checkout. This baseline inspection did not rerun or independently verify the earlier review, and no legacy runtime validation is claimed.

The original specification describes the earlier application as using React/TypeScript, a Cloudflare-oriented runtime, D1/R2, optional OpenAI-generated answers, browser face models, and protected staff records, with an unused Python `face-service/`. The new design requires local runtime dependencies. Its documented privacy and consent requirements carry forward when future features are implemented.

## What the first main merge should contain

A working kiosk shell, gateway, attendance-service skeleton, knowledge-service skeleton, local configuration, health/status APIs, Ollama connectivity diagnostics, automated checks, and these engineering documents. It must not collect real student data yet. Check-in and Ask remain visibly unavailable until their feature tasks are merged.

After MS-000 is implemented and verified, use its reviewed pull request and **Squash and merge** to land one foundation commit on `main`. Keep small, ordered implementation commits on the task branch. Rebase and all publication/merge operations require explicit approval. Preserve the existing main history.

See [the future task index](docs/tasks/INDEX.md) for the intended sequence. Those entries are planning only.
