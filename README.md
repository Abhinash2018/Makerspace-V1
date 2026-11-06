# Makerspace Assistant — local-first foundation

Prepared for Abinash Ghimire • 6 November 2026

## What this package is

This is an implementation specification for a new local-first foundation, written for both contributors and coding assistants. It is **not implemented software**, a completed migration, or proof that tests pass. Implement only `MS-000` now. Its acceptance boxes intentionally start unchecked.

The project will provide a touch-first Makerspace kiosk: check-in, questions answered from approved documents, optional face check-in, and protected staff history. Ollama will generate answers locally. Internet access, cloud accounts, paid APIs, and external databases must not be required during ordinary operation after installation.

“Local” still means running software: a browser, several small backend processes, and the Ollama process on the Makerspace PC. An iPad can later use that PC over a local network; the iPad does not run this backend itself.

## Start here

1. Read [the initial task](docs/tasks/MS-000-foundation.md).
2. Read [the architecture and drawings](docs/architecture/ARCHITECTURE.md).
3. Follow [the Git workflow](docs/GIT_WORKFLOW.md).
4. Use [the offline setup contract](docs/LOCAL_SETUP.md) when implementing setup.
5. For the next feature, copy [the task template](docs/tasks/TEMPLATE.md) into a new task file on its feature branch.

Paste this into your coding assistant after placing the entire `local/` directory in your repository:

> Read `local/AGENTS.md`, `local/README.md`, `local/docs/architecture/ARCHITECTURE.md`, `local/docs/LOCAL_SETUP.md`, `local/docs/GIT_WORKFLOW.md`, and `local/docs/tasks/MS-000-foundation.md`. Inspect the repository first. Implement only MS-000 on `chore/MS-000-local-foundation`. Keep the existing application working and preserve its Git history. Build a runnable local foundation, test it, and record actual results in the task file. Explain the service boundaries and commands in plain language. Do not implement the future backlog or claim a push, merge, hardware test, or offline test happened unless it actually did.

## Placement and existing project

Unzip this package into the existing repository root. It adds `local/`; it does not replace the existing root README or application. `local/` is the new, independent workspace. Run its commands from that directory. Root-level CI configuration may be added to check it. Do not make the legacy root package manager accidentally treat it as part of the old workspace.

The existing [MakerspaceAssistant repository](https://github.com/Abhinash2018/MakerspaceAssistant) was inspected on 6 November 2026 at commit `ad50c184b3e4914e01e00e6eb862bc26fec3e0a9`: README, START_HERE, package.json, database schema, and route/file inventory. This was a source/document review, not a runtime audit. The earlier saved Makerspace site text and Python pyproject were also checked; the live repository is the reference for the existing web application.

The existing documentation describes React/TypeScript, a Cloudflare-oriented runtime, D1/R2, optional OpenAI-generated answers, browser face models, and protected staff records. The old Python `face-service/` is documented as unused. The new design replaces cloud runtime dependencies deliberately; copying the old deployment configuration would not achieve offline operation. Existing protections and consent behavior are requirements to preserve when features are migrated.

## What the first main merge should contain

A working kiosk shell, gateway, attendance-service skeleton, knowledge-service skeleton, local configuration, health/status APIs, Ollama connectivity diagnostics, automated checks, and these engineering documents. It must not collect real student data yet. Check-in and Ask remain visibly unavailable until their feature tasks are merged.

There is no repository push or code implementation in this document package. After MS-000 is implemented and verified, use its reviewed pull request as the initial foundation merge into the existing `main`. Never replace existing main history to create an artificial “first commit.”

See [the future task index](docs/tasks/INDEX.md) for the intended sequence. Those entries are planning only.
