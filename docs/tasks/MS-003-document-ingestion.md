# MS-003 — Approved local document ingestion

| Field | Value |
| --- | --- |
| Status | Done — Windows implementation accepted; final squash handoff below |
| Branch | `feat/MS-003-document-ingestion` |
| Owner | Abinash Ghimire; Codex implements the active request |
| Dependencies | MS-001; starting from local main after completed MS-002 squash `bbd3fa0d` |
| Task path | `docs/tasks/MS-003-document-ingestion.md` |
| Intended squash commit | `feat(MS-003): ingest approved PDFs into a versioned local index` |
| PR/publication | Owner explicitly approved pushes to Abhinash2018/Makerspace-V1 on 14 November 2026; deployment separate |

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
| 1 | `docs(MS-003): define approved document ingestion` | Baseline/links/scope/dependency evidence | Done `b9c2b7e`; dependency handoff `6936915` |
| 2 | Pin local PDF.js dependency | Lockfile/frozen install/native Node import, no build allowlist broadening | Done `7a9e507` |
| 3 | Strict knowledge embedding settings | Validation, exclusive configuration, missing/corrupt/symlink paths, redaction | Done `405a4d2` |
| 4 | Bounded PDF extraction and deterministic chunks | Synthetic multi-page text, encrypted/empty/malformed/limits/deadline, page provenance | Done `cd962a7` |
| 5 | Fixed local embedding adapter | Fake HTTP bounds/remote rejection/vector validation, real installed CPU model | Done `9daeb40` |
| 6 | Owned migration and index repository | Upgrade/rerun/ownership, atomic current version, duplicate/conflict, vector compatibility/limits | Done `f158d2c`; final completeness hardening follows |
| 7 | Approved ingestion/reindex orchestration | No-approval refusal, failure/cancellation rollback, digest/version changes, incomplete corpus detection | Done `cb08186` |
| 8 | Operator commands/status/runbook | Native subprocess success/failure and secret-free output; no automatic source import | Commands done `82e79f0`; runbook finalizing |
| 9 | Acceptance and handoff | Full lint/type/build/unit/process/browser, real synthetic PDF/model check, source/index audit, local rebase/squash | In progress; OS firewall test administratively unavailable |

## Acceptance criteria

- [x] A synthetic two-page PDF yields deterministic chunks with correct page provenance; malformed/encrypted/empty/oversized input fails without invented text.
- [x] Extraction/batch/vector/time/resource bounds and cancellation are exercised; no visitor-provided URL/model, PDF action invocation, CDN or cloud fallback exists.
- [x] Only explicitly approved regular local PDFs enter private source/index storage; settings/source symlinks and unknown schema fail closed.
- [x] Existing knowledge metadata upgrades safely and remains service-owned; startup never migrates or recreates a missing DB.
- [x] Current duplicate imports are idempotent; a changed source/title creates a new immutable version; concurrent/failed/cancelled preparation cannot partially replace the active index.
- [x] Vectors record exact model digest/dimension/prefix/chunker identity; incompatible/new models require a separate complete index, without mixed-vector retrieval.
- [x] Reindex/status work on approved private sources and expose only bounded metadata/counts; model/settings/DB failure does not damage the active prior corpus.
- [x] Synthetic PDF ingestion and lookup succeed with the already installed CPU embedding model; fake-provider results are distinguished from real-model/offline evidence.
- [x] Attendance/auth/status/lifecycle behavior remains correct and independent; no student/production data or prompts/paths/bodies enter logs or commits.
- [x] Runbook, contract/data decisions, actual checks and remaining platform/parser/model limits are documented; source/Git audit passes (final audit record follows).

## Verification evidence

| Check | Command/procedure | Actual result | Limits |
| --- | --- | --- | --- |
| Baseline/branch | Inspect knowledge/config/manifests/scripts/history; create `feat/MS-003-document-ingestion` from main | Passed, 13 November 2026 | Local base `bbd3fa0d`; unrelated staging preserved; no push |
| Model/runtime inventory | Loopback tags/status and installed manifests; owned daemon | Ollama 0.32.5, cloud disabled; existing EmbeddingGemma reused on CPU | Exact digest below; no downloads/global settings |
| Unit/tooling | `pnpm test` alone | 16 tooling + 75 unit tests passed, 31 Vitest files | Concurrent heavy-check run had four timeouts; identical standalone rerun passed without relaxing limits |
| Static/build | `pnpm lint`; `pnpm build` | Passed; build includes strict workspace typecheck and production Vite bundle | Pinned Node 24.22.2/pnpm 10.34.9, isolated frozen verification copy |
| Native processes | `pnpm test:integration`; final focused `tests/integration/knowledge.test.ts` | Six checks passed across five files; final knowledge command rerun passed | Synthetic temporary runtime; no operator DB/settings read |
| Browser regression | `pnpm test:e2e` | Three Chromium flows passed; desktop/mobile screenshots inspected | External browser requests blocked; unchanged UI; no Safari/iPad/Linux execution |
| Real model | `pnpm knowledge:acceptance --cpu` | Passed: synthetic 2-page PDF, 2 x 768-dimensional chunks, duplicate/reindex preservation and expected-page lookup | 4,802 ms; fake providers distinguished; not an institutional grounding evaluation |
| OS offline isolation | Ignored temporary program-scoped firewall test | Not run: shell lacks administrator token; zero rules created/remaining | Outbound control remained available; no new OS-isolation pass claimed; MS-000 history separate |
| Source/Git/docs | `task-source-audit.mjs bbd3fa0d`; exact-path commits and history audit | Preliminary audit passed; final record appended below | Preserves 31,185 original staged additions/13 PDF changes; no force push |

PDF dependency checkpoint — 14 November 2026: pinned `pdfjs-dist` 6.5.438 in the knowledge-owned manifest and lockfile, resolving its optional local `@napi-rs/canvas` 1.1.1 platform packages. Three packages were added for this Windows platform in the isolated verification copy. Native Node 24 imports the local legacy PDF.js build and reports the expected version/getDocument API. `pnpm install --frozen-lockfile --offline` then passed with an unchanged lockfile. Existing pins and the native-build allowlist are unchanged; no global tool update was accepted. The original installed/staged dependency tree was not modified. No parser behavior, document import or model download is claimed from dependency verification.

Dependency/runtime handoff — 14 November 2026: MS-002's permanent task record now includes actual squash `bbd3fa0d`, retained 19-commit branch and final audit/rebase evidence. Started one tracked hidden test-owned daemon (PID 15256) only after confirming no listener/process and an existing Ollama identity. Process-scoped settings bind `127.0.0.1:11434`, disable cloud/debug and reuse the existing model directory; no global setting, credential or model was created. API reports Ollama 0.32.5 and cloud disabled. Existing `embeddinggemma:latest` digest is `85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1`, total tag size 621,875,917 bytes; Google Gemma license applies. Existing qwen3:4b remains separate for later chat. No generation/embedding pass is claimed yet; CPU model verification follows with the adapter.

Knowledge settings checkpoint — 14 November 2026: `settings.ts` owns a bounded strict `embedding-settings.json` beneath knowledge runtime storage, with a disabled default when absent. Explicit configuration exclusively creates it with an installed model selector, CPU mode and model-specific retrieval/document prefixes; it never overwrites an existing file or changes the shared `.env` contract. Two synthetic tests cover exclusive preservation, immutable settings, model/prefix/key bounds, malformed/oversized files and junction refusal. Focused lint and full typecheck pass in the verification copy. Prefix identity is recorded for later index compatibility; no document/model call is made by settings loading. Windows ACL inheritance remains unchanged.

## Contributor explanation

Final check scheduling — 14 November 2026: a concurrent compiler/lint/full-unit run hit four timing limits (old credential/SQLite worker tests and new PDF/ingestion tests). No timeout/assertion was relaxed. After compiler/lint finished, the identical full suite passed alone: 16 tooling and 75 unit tests, 7.14-second Vitest duration versus 28.29 seconds during the failed concurrent run. This supports resource contention as the cause, without claiming an unavailable OS memory measurement. Full strict typecheck/build and lint separately passed. Keep heavyweight compiler/model/test runs separate on this host. The final native knowledge command check is rerun after completeness hardening; prior auth/attendance/browser regressions remain passed with unchanged UI/contracts.

Completeness review — 14 November 2026: a final repository review added verification that each current membership has its declared chunk count, so missing stored chunks cannot masquerade as a complete corpus. Reindex now checks the entire current-document snapshot inside its publication transaction, rejecting an import added during preparation. Eight focused migration/repository/ingestion tests pass, including both cases. Earlier 99-test regression run passed all six native-process and three Chromium checks; reviewed desktop status/mobile check-in screenshots remain clear. A new OS firewall-isolation run stopped at the administrator prerequisite, with zero rules created/remaining and outbound control still available. It is unrun, not passed; MS-000's historical isolation evidence is separate. Real synthetic CPU ingestion passed without this OS-isolation claim.

Publication checkpoint — 14 November 2026: owner explicitly approved the exact repository after automatic review asked for destination confirmation. Retried atomic fast-forward push succeeded: main now includes completed MS-000/MS-001/MS-002 squashes; the MS-001/MS-002 grouped branches and MS-003 through `cb08186` are published. No force push, history replacement, PR message, deployment or private runtime files. The earlier rejection was resolved by explicit destination approval, not a workaround.

Native/real ingestion checkpoint — 14 November 2026: the native subprocess operator test passed configure/status/approval refusal/import/duplicate/reindex/malformed refusal, checking output excludes fixture paths, credentials and document bodies. Explicit `pnpm knowledge:acceptance --cpu` then passed on the installed real EmbeddingGemma model: one synthetic two-page PDF, two stored 768-dimensional chunks, duplicate and reindex preservation, query-vector lookup ranking the expected training page first; 4,802 ms total. It operates solely on a disposable synthetic workspace. Real model quality on institutional documents is not established; this run did not block outbound networking and is not labelled an offline-isolation pass. Full lint, production build/typecheck and 16 tooling + 74 unit tests pass; complete process/browser suites follow.

Source/orchestration checkpoint — 14 November 2026: regular local-file reads are byte-bounded and reject UNC/URLs/junctions; digest-only private copies are exclusively written and fsynced, with existing content verified rather than overwritten. Three source/ingestion tests pass, including explicit approval before storage/model work, duplicate import, model failure preserving evidence, atomic failed/successful all-corpus reindex, corruption refusal, cancellation and concurrent preparation conflicts. An initial source test caught use of a directory-only guard on the file itself; parent components and the leaf are now checked separately. Full unit/tooling run passed 73 + 16 tests before the subsequent startup/CLI additions. Full lint/typecheck now pass after correcting a duplicate output property in the uncommitted CLI group; no check was disabled. A crash before DB commit can leave an inactive private orphan, documented for MS-010 cleanup review.

Push request — 14 November 2026: owner requested pushing code as commits are made and retaining squash workflow. Committed-history path audit, original staged-entry preservation and fast-forward ancestry checks passed. Automatic approval review rejected the attempted atomic push because exact destination authorization/trust was unverified. Asked for approval naming `https://github.com/Abhinash2018/Makerspace-V1`; no retry or alternate publication path while pending. Grouped local commits continue. Earlier no-push statements describe earlier authorization.

Repository checkpoint — 14 November 2026: knowledge migration 2 adds strict version/current-pointer/index/membership/chunk tables with foreign keys. Five migration/repository tests pass, including known-foundation upgrade, rerun, unknown ownership/history/layout/future refusal, runtime junction refusal, immutable prior versions, duplicate imports, stale-writer conflicts, all-document transaction rollback, model-bucket incompatibility and version/index quotas. Full lint/typecheck pass. Limits are 50 logical documents, 10 versions/document, four model identities, 5,000 current chunks/index and 20,000 stored chunks total; exhaustion refuses work without deleting history. Float32 vectors retain exact model/digest/prefix/chunker identity; version metadata also records PDF.js 6.5.438. DB transactions run only after model preparation, and retrieval refuses missing current memberships. Operator databases have not been opened or migrated.

Embedding checkpoint — 14 November 2026: two fake-loopback tests exercise fixed paths, batch/input/output bounds, CPU/truncate/prefix settings, normalized Float32 vectors, remote/cloud rejection, redirect/timeout/cancellation, wrong model/count/dimensions and digest changes. Focused lint and full strict typecheck pass after correcting optional-property construction. A real CPU application-adapter call to installed EmbeddingGemma produced two 768-dimensional vectors with norms 1.000000001/0.999999989 in 9,288 ms, exact recorded digest `85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1`. No model download or fallback. An initial inline probe failed only due to PowerShell argument quoting; rerun from an ignored script succeeded. This confirms embeddings, not corpus ingestion/retrieval or grounding quality.

PDF/chunk checkpoint — 14 November 2026: five focused tests pass, covering synthetic multi-page extraction/empty-page provenance, real AES-256 encrypted input refusal, malformed/no-text/10 MiB/100-page limits, cancellation/deadline termination and deterministic Unicode/page-preserving chunk bounds. Full typecheck and focused parser/chunker lint pass. The tiny encrypted fixture contains synthetic policy text only; generated once with isolated Python tools, decrypted/extracted and visually inspected. Python is not a runtime/CI dependency. PDF.js runs bytes-only in a bounded worker with network fetch refused and third-party output discarded. Native Node rejects a proposed worker V8 evaluation flag; that flag was not shipped. PDF.js 6 loading-task cleanup and local file-URL assets were verified after correcting API/version differences. Source inputs and atomic publication are subsequent groups, not implied by parser checks.

Import is a deliberate preparation step. It extracts bounded page text, embeds it using one installed local model and atomically publishes a version only when all pieces are complete. The index knows which model and page produced every vector. Later answers must retrieve compatible current evidence; a model change cannot silently reuse incompatible old vectors. A failed import leaves the previously accepted version available.

## Rollback and operational impact

Migration 2 is append-only; reverting code does not remove versions/vectors/files. Preserve a SQLite-safe backup and private source files before an operator-approved rollback. Do not drop the DB or delete old versions/files to make checks pass. Runtime/model files remain ignored. Reuse installed models only; any explicitly started daemon is loopback/no-cloud and tracked as test-owned, with no global settings or unrelated process changes.

## Completion record

Final pre-squash audit — 14 November 2026: `task-source-audit.mjs bbd3fa0d` passed on branch `feat/MS-003-document-ingestion`: 34 committed task paths, 29 runtime/test/config paths byte-equal to the verification copy, 54 local Markdown links/nine heading anchors valid, original unrelated index preserved. Runbook-only additions increase the final path/link count; rerun before squash. Exact-path whitespace/history checks passed. Last code `2efbb3c` passed full standalone tooling/unit, lint/build/typecheck, focused native operator and focused integrity tests. Full six-process/three-browser regression passed before the final completeness-only fix; unchanged UI/contracts were not needlessly retested. No ignored/private runtime files are committed.

- Changed paths: knowledge settings/PDF worker/chunker/embedding adapter/schema/repository/source/ingestion/commands; synthetic fixtures/unit/native/manual acceptance checks; manifest/lockfile; architecture/setup/workspace/Git/task documentation.
- Decisions: knowledge-owned configuration/data, explicit operator approval, text-PDF extraction, deterministic page provenance, independent local embeddings and versioned model-compatible index.
- Limits: Windows verified using isolated dependencies; original checkout dependency installation remains incomplete. Fresh OS firewall isolation requires an administrator token and remains unrun. No Linux/remote CI/Safari/iPad or institutional corpus/model-policy approval. PDF resource guards are not an OS sandbox; no OCR/public upload/generated answers. Private orphan cleanup/backup lifecycle is MS-010. Existing operator runtime still needs explicit knowledge migration 2 and deliberate embedding configuration; development did not modify it.
- Next task: MS-004 grounded answers after this evidence store is accepted; later backlog follows dependencies.
- Revision/date: final runtime source `2efbb3c`, 14 November 2026; source-equal rebase/squash SHA recorded after creation in the next task's dependency handoff.

Primary references: [PDF.js Node example](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs), [official package metadata](https://registry.npmjs.org/pdfjs-dist/latest), [Ollama embed API](https://docs.ollama.com/api/embed), [EmbeddingGemma library](https://ollama.com/library/embeddinggemma), [Google model card/license and usage](https://huggingface.co/google/embeddinggemma-300m). Installed assets do not constitute a new institutional license/policy approval.
