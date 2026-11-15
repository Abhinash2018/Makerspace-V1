# MS-003 — Approved local document ingestion

| Field | Value |
| --- | --- |
| Status | In progress — specification checkpoint |
| Branch | `feat/MS-003-document-ingestion` |
| Owner | Abinash Ghimire; Codex implements the active request |
| Dependencies | MS-001; starting from local main after completed MS-002 squash `bbd3fa0d` |
| Task path | `docs/tasks/MS-003-document-ingestion.md` |
| Intended squash commit | `feat(MS-003): ingest approved PDFs into a versioned local index` |
| PR/publication | None; no push/deployment authorized |

## Problem and outcome

The knowledge service can diagnose Ollama but has no approved document corpus. A local operator needs to explicitly approve a PDF, extract page-associated text, create local embeddings and publish a complete version without exposing a half-built index. Later answers must cite the exact approved document version and page, not the model's prior knowledge. MS-004 adds question answering; this task supplies its evidence store.

## Scope and exclusions

Implement a bounded text-PDF parser, deterministic page-preserving chunks, service-owned SQLite migration/repository, fixed-loopback embedding adapter, private source storage, versioned indexes, explicit configuration/import/reindex/status CLIs and synthetic acceptance fixtures. No document is imported automatically. Operator approval is an explicit CLI flag/path, not a model decision. There is no visitor upload, arbitrary URL fetch, general Ollama proxy, cloud fallback, hosted vector DB or model pull.

Exclude generated answers/chat (MS-004), student identity/attendance, photographs/face data, speech, LAN rollout and OCR. Image-only PDFs must fail clearly instead of claiming text was indexed. Partially text-bearing PDFs must report unindexed page counts; only actual extracted passages may later be cited. Approval/quality of a real institutional corpus remains an operator responsibility; automated checks use synthetic documents only.

## Read before coding and baseline

Read [AGENTS.md](../../AGENTS.md), [architecture](../architecture/ARCHITECTURE.md), [setup](../LOCAL_SETUP.md), [Git workflow](../GIT_WORKFLOW.md), the task template, [MS-001](MS-001-access-controls.md), [MS-002](MS-002-manual-checkin.md) and knowledge/Ollama/config/HTTP/fixture source.

- Branch created from local main `bbd3fa0d`, 13 November 2026. MS-002 has 80 passing automated tests, full lint/typecheck/build and reviewed desktop/mobile Chromium screenshots. Its 19 grouped commits remain on `feat/MS-002-manual-checkin`; final squash index equaled the tested feature tree across 37 task paths.
- Fresh fetch before MS-002 handoff found `origin/main` still at `ccf3c34`. Local main preserves separate MS-000/MS-001/MS-002 commits. No push or remote merge.
- Preserve the original 31,185 staged additions/runtime/dependencies/config and 13 pre-existing PDF moves/deletions. Exact named-path commits and semantic index audits continue. The installed working dependency tree is incomplete; source checks use the separate offline-installed verification copy and portable pinned Node 24.22.2/pnpm 10.34.9.
- Read-only inventory found no Ollama listener/process. The existing executable is present, and manifests include `embeddinggemma:latest`, `qwen3:4b` and `mistral:latest`. EmbeddingGemma's existing model layer is 621,867,104 bytes. Reuse it on CPU for real synthetic-fixture verification; do not download or replace a model. Record actual API digest/version/dimensions/license evidence after starting the owned loopback-only/no-cloud daemon. Leave unrelated processes and global settings alone.
- Mozilla PDF.js official stable package/registry metadata identifies `pdfjs-dist` 6.5.438, Apache-2.0, Node >=22.13 or >=24, with local optional canvas assets. Pin the tested package in knowledge's manifest/lockfile. No CDN code or runtime asset fetch is allowed.
- Owner authorizes grouped local commits/branches and final local rebase/squash, then continuing dependencies. No new per-group commit question; deployment/publication remain separate.

## Design and boundaries

### Ownership, configuration and transport

Knowledge owns source PDFs, extracted text, version records, chunk metadata and vectors in its private runtime directory/`knowledge.sqlite`. Neither gateway nor attendance imports its repositories or accesses its DB/files. Shared packages remain schemas and bounded technical HTTP/logging helpers only.

Keep the common `.env` contract unchanged. Embedding settings belong to a strict bounded knowledge-owned JSON file under ignored runtime storage, created explicitly by an operator command. Missing settings disable ingestion cleanly without affecting DB readiness/attendance. Validate supported local model ID, CPU mode and prefix lengths; refuse unknown keys/symlinks/malformed files. Never treat a visitor-provided model or URL as configuration. Embedding/chat models are distinct; MS-004 uses the existing separate chat setting.

The adapter discovers a downloaded local model through fixed `/api/tags` and posts bounded text batches only to fixed `/api/embed`. Reject cloud/remote model markers, redirects, malformed/nonfinite/zero/dimension-mismatched vectors, model-name/digest changes, oversized output and timeout/cancellation. Send `truncate:false` so an overlong chunk fails instead of losing evidence silently. CPU is explicit, not a retry/fallback. No pull/download endpoint exists. Apply model-appropriate query/document prefixes and include them in index identity. Do not log input text, vectors, source paths or raw responses.

### PDF extraction and chunking

Use PDF.js from local installed files, in a worker with a heap limit and a ten-second owner deadline. Capture/discard third-party worker stdout/stderr; report fixed error codes. Accept only regular local PDFs (no symlink/UNC/URL input), at most 10 MiB/100 pages; reject encrypted/unreadable/malformed/oversized files. Disable XFA/font-face/network loading, use only packaged font/CMap assets, and never invoke document actions. PDF.js 6 removed the older `isEvalSupported` option; the implementation does not claim a V8 evaluation sandbox. Worker limits are resource guards, not a claimed malware-proof OS sandbox.

Preserve the one-based PDF page number and extracted text order. Bound per-page/total text and chunk counts; normalize whitespace/control noise, use deterministic ~1000-character chunks with overlap and never join different pages into one chunk. Store chunker/parser version. Empty text is an explicit failure; partial extraction reports empty pages. Do not invent OCR text, page numbers or successful ingestion.

### Versioning, local index and atomic publication

Append migration 2 after the known knowledge foundation metadata. Reject foreign/future/unknown schemas and require explicit migration. Store immutable document versions with logical key/title, source SHA-256, page/extracted-page counts and UTC import time. Private source filename is its digest, not an untrusted path. Keep old versions for traceable citations; active versions change only in an immediate transaction after extraction/embedding/file preparation succeed.

Index identity includes model name/digest, dimensions, query/document prefixes and chunker version. Store finite normalized Float32 vectors with that identity; never mix dimensions/models or silently use an old index after configuration changes. A document/index membership row and all its chunks publish in the same transaction. A repeated current key/hash/title/index is idempotent; a content/title change creates the next version. Use optimistic version checks so concurrent preparations cannot silently overwrite another import. Failed/cancelled/changed-model work leaves the old current document/index intact.

Provide explicit reindex over already approved private sources. Build the selected model bucket and report corpus completeness; later retrieval must use only the selected identity/current versions and refuse an incomplete/incompatible corpus. No external vector service is necessary for this small bounded collection. Keep limits on document/version/current-chunk counts and fail quota exhaustion without deleting prior history. Query/index contracts must retain opaque chunk ID, document key/version/hash/title and page provenance for MS-004.

Prepare/hash/fsync a private source before committing DB references. A crash before DB commit may leave an inactive orphan file; it must never become retrievable automatically. Do not delete unrelated files. MS-010 owns reviewed orphan/backup lifecycle. No long database transaction remains open while a model call runs.

### Operator interfaces

Commands configure embeddings, import one explicitly approved PDF with a logical key/title, reindex approved sources and report counts/model compatibility. No password/token/prompt/file body on stdout; errors use fixed messages. Model IDs and approval flags are non-secret arguments. Ingestion is an explicit local operator operation; browser-facing retrieval/answers and staff document UI are outside this task. No empty successful import or background model download.

## Ordered commit groups

Finish focused tests/evidence before each exact-path commit; split coupled work when independently verifiable. Retain grouped branch history and one final local main squash after acceptance.

| Group | Outcome / proposed message | Verification | Status |
| --- | --- | --- | --- |
| 1 | `docs(MS-003): define approved document ingestion` | Baseline/links/scope/dependency evidence | In progress |
| 2 | Pin local PDF.js dependency | Lockfile/frozen install/native Node import, no build allowlist broadening | Planned |
| 3 | Strict knowledge embedding settings | Validation, exclusive configuration, missing/corrupt/symlink paths, redaction | Planned |
| 4 | Bounded PDF extraction and deterministic chunks | Synthetic multi-page text, empty/malformed/limits/deadline, page provenance | Planned |
| 5 | Fixed local embedding adapter | Fake HTTP bounds/remote rejection/vector validation, real installed CPU model | Planned |
| 6 | Owned migration and index repository | Upgrade/rerun/ownership, atomic current version, duplicate/conflict, vector compatibility/limits | Planned |
| 7 | Approved ingestion/reindex orchestration | No-approval refusal, failure/cancellation rollback, digest/version changes, incomplete corpus detection | Planned |
| 8 | Operator commands/status/runbook | Native subprocess success/failure and secret-free output; no automatic source import | Planned |
| 9 | Acceptance and handoff | Full lint/type/build/unit/process/browser, real synthetic PDF/model check, source/index audit, local rebase/squash | Planned |

## Acceptance criteria

- [ ] A synthetic two-page PDF yields deterministic chunks with correct page provenance; malformed/encrypted/empty/oversized input fails without invented text.
- [ ] Extraction/batch/vector/time/resource bounds and cancellation are exercised; no arbitrary URL/model, PDF action, CDN or cloud fallback exists.
- [ ] Only explicitly approved regular local PDFs enter private source/index storage; settings/source symlinks and unknown schema fail closed.
- [ ] Existing knowledge metadata upgrades safely and remains service-owned; startup never migrates or recreates a missing DB.
- [ ] Current duplicate imports are idempotent; a changed source/title creates a new immutable version; concurrent/failed/cancelled preparation cannot partially replace the active index.
- [ ] Vectors record exact model digest/dimension/prefix/chunker identity; incompatible/new models require a separate complete index, without mixed-vector retrieval.
- [ ] Reindex/status work on approved private sources and expose only bounded metadata/counts; model/settings/DB failure does not damage the active prior corpus.
- [ ] Synthetic PDF ingestion and lookup succeed with the already installed CPU embedding model; fake-provider results are distinguished from real-model/offline evidence.
- [ ] Attendance/auth/status/lifecycle behavior remains correct and independent; no student/production data or prompts/paths/bodies enter logs or commits.
- [ ] Runbook, contract/data decisions, actual checks and remaining platform/parser/model limits are documented; source/Git audit passes.

## Verification evidence

| Check | Command/procedure | Actual result | Limits |
| --- | --- | --- | --- |
| Baseline/branch | Inspect knowledge/config/manifests/scripts/history; create `feat/MS-003-document-ingestion` from main | Passed, 13 November 2026 | Local base `bbd3fa0d`; unrelated staging preserved; no push |
| Model/runtime inventory | Loopback tags probe; read-only elevated process/listener/executable/manifest inspection | Existing assets found, daemon stopped | No generation/model download; API inventory unavailable before startup |
| New checks | Fill per group | Not run | No MS-003 runtime implementation yet |
| Real/offline/platform | Fill during acceptance | Not run | Existing MS-002 results are historical; no operator documents/data imported |

PDF dependency checkpoint — 14 November 2026: pinned `pdfjs-dist` 6.5.438 in the knowledge-owned manifest and lockfile, resolving its optional local `@napi-rs/canvas` 1.1.1 platform packages. Three packages were added for this Windows platform in the isolated verification copy. Native Node 24 imports the local legacy PDF.js build and reports the expected version/getDocument API. `pnpm install --frozen-lockfile --offline` then passed with an unchanged lockfile. Existing pins and the native-build allowlist are unchanged; no global tool update was accepted. The original installed/staged dependency tree was not modified. No parser behavior, document import or model download is claimed from dependency verification.

Dependency/runtime handoff — 14 November 2026: MS-002's permanent task record now includes actual squash `bbd3fa0d`, retained 19-commit branch and final audit/rebase evidence. Started one tracked hidden test-owned daemon (PID 15256) only after confirming no listener/process and an existing Ollama identity. Process-scoped settings bind `127.0.0.1:11434`, disable cloud/debug and reuse the existing model directory; no global setting, credential or model was created. API reports Ollama 0.32.5 and cloud disabled. Existing `embeddinggemma:latest` digest is `85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1`, total tag size 621,875,917 bytes; Google Gemma license applies. Existing qwen3:4b remains separate for later chat. No generation/embedding pass is claimed yet; CPU model verification follows with the adapter.

Knowledge settings checkpoint — 14 November 2026: `settings.ts` owns a bounded strict `embedding-settings.json` beneath knowledge runtime storage, with a disabled default when absent. Explicit configuration exclusively creates it with an installed model selector, CPU mode and model-specific retrieval/document prefixes; it never overwrites an existing file or changes the shared `.env` contract. Two synthetic tests cover exclusive preservation, immutable settings, model/prefix/key bounds, malformed/oversized files and junction refusal. Focused lint and full typecheck pass in the verification copy. Prefix identity is recorded for later index compatibility; no document/model call is made by settings loading. Windows ACL inheritance remains unchanged.

## Contributor explanation

PDF/chunk checkpoint — 14 November 2026: five focused tests pass, covering synthetic multi-page extraction/empty-page provenance, real AES-256 encrypted input refusal, malformed/no-text/10 MiB/100-page limits, cancellation/deadline termination and deterministic Unicode/page-preserving chunk bounds. Full typecheck and focused parser/chunker lint pass. The tiny encrypted fixture contains synthetic policy text only; generated once with isolated Python tools, decrypted/extracted and visually inspected. Python is not a runtime/CI dependency. PDF.js runs bytes-only in a bounded worker with network fetch refused and third-party output discarded. Native Node rejects a proposed worker V8 evaluation flag; that flag was not shipped. PDF.js 6 loading-task cleanup and local file-URL assets were verified after correcting API/version differences. Source inputs and atomic publication are subsequent groups, not implied by parser checks.

Import is a deliberate preparation step. It extracts bounded page text, embeds it using one installed local model and atomically publishes a version only when all pieces are complete. The index knows which model and page produced every vector. Later answers must retrieve compatible current evidence; a model change cannot silently reuse incompatible old vectors. A failed import leaves the previously accepted version available.

## Rollback and operational impact

Migration 2 is append-only; reverting code does not remove versions/vectors/files. Preserve a SQLite-safe backup and private source files before an operator-approved rollback. Do not drop the DB or delete old versions/files to make checks pass. Runtime/model files remain ignored. Reuse installed models only; any explicitly started daemon is loopback/no-cloud and tracked as test-owned, with no global settings or unrelated process changes.

## Completion record

- Changed paths: specification/scope/index at group 1; fill later groups with evidence.
- Decisions: knowledge-owned configuration/data, explicit operator approval, text-PDF extraction, deterministic page provenance, independent local embeddings and versioned model-compatible index.
- Limits: implementation/tests/real model gate pending. OCR, public uploads, generated answers and corpus policy approval are excluded.
- Next task: MS-004 grounded answers after this evidence store is accepted; later backlog follows dependencies.
- Revision/date: local base `bbd3fa0d`, 13 November 2026.

Primary references: [PDF.js Node example](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs), [official package metadata](https://registry.npmjs.org/pdfjs-dist/latest), [Ollama embed API](https://docs.ollama.com/api/embed), [EmbeddingGemma library](https://ollama.com/library/embeddinggemma), [Google model card/license and usage](https://huggingface.co/google/embeddinggemma-300m). Installed assets do not constitute a new institutional license/policy approval.
