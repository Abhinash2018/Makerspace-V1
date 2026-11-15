# MS-004 — Grounded local document answers

| Field | Value |
| --- | --- |
| Status | In progress — specification checkpoint |
| Branch | `feat/MS-004-grounded-answers` |
| Owner | Abinash Ghimire; Codex implements authorized backlog |
| Dependencies | MS-001, MS-003; local/remote main `32a45cff` |
| Task path | `docs/tasks/MS-004-grounded-answers.md` |
| Intended squash | `feat(MS-004): answer from approved local evidence with citations` |
| Publication | Owner approved verified branch/main pushes to Abhinash2018/Makerspace-V1; deployment separate |

## Problem and outcome

Visitors can check in but cannot ask about approved documents. Add a transient kiosk question flow backed by knowledge-owned retrieval and the installed local chat model. Return bounded, validated verbatim evidence excerpts with exact document/version/page citations. Refer to staff when evidence is insufficient, incompatible or model work fails. This deliberately restricts the model to selecting source excerpts rather than producing unverifiable free-form policy claims. Citation validity is mechanical; relevance still requires evaluation and operator corpus review.

## Read before coding and baseline

Read [architecture](../architecture/ARCHITECTURE.md), [AGENTS.md](../../AGENTS.md), [workflow](../GIT_WORKFLOW.md), [setup](../LOCAL_SETUP.md), [MS-003](MS-003-document-ingestion.md), contracts, gateway guards, bounded HTTP helpers, knowledge index/embedding/runtime code, kiosk auth and fixtures before implementation. Inspected current branch/worktree/manifests/scripts. Preserve the original unrelated staged dependencies, secrets/runtime and 13 PDF moves; use exact-path commits and the existing clean squash worktree. No operator DB/settings or real documents are read/imported.

MS-003 completed as main squash `32a45cff4f83d43ec48a0cc97f76fcd1ccabe81b`, pushed without force. Its 12 grouped branch commits remain through `271cad3d`. Rebase was already current; the 38-path squash index exactly equaled the tested branch tree. Final pre-squash source audit validated 29 runtime paths, 56 links/ten anchors and preserved unrelated staging. Checks: 16 tooling, 75 unit, six process and three Chromium tests; lint/typecheck/build; real installed CPU EmbeddingGemma synthetic ingestion/lookup. Four timeouts during concurrent heavyweight checks resolved on an identical standalone suite without relaxed limits. New administrator-only OS firewall isolation remained unrun, with no rules created. Windows verified; Linux/remote CI/Safari/iPad remain unrun.

## Scope and boundaries

Knowledge owns retrieval, selected model identity, queue/concurrency and answer validation. Gateway owns kiosk authentication, CSRF, request rate and cancellation; it calls only an explicit authenticated internal HTTP contract. Shared packages hold strict wire schemas and small helpers. Attendance receives no question data and never depends on AI. No database migration, model pull, cloud fallback, general proxy, shell/tools, conversation persistence, document upload or public source-file serving. No names/NetIDs/session identities are forwarded from attendance/auth into model inputs. Warn visitors to omit personal information; free-text privacy cannot be guaranteed by keyword filtering.

## Design and contracts

- Browser `POST /api/v1/question`, kiosk role/Origin/CSRF required, six requests/minute. Strict `{question}` only; normalize NFC/whitespace, 1–500 characters and at most 2,000 UTF-8 bytes, reject controls. Never log questions/evidence/generated content.
- Internal `POST /internal/v1/answers`, generated service token/request ID required, same strict input. Strict answered/uncertain response with request ID, fixed disclaimer, at most two excerpt/citation objects. Citations retain opaque chunk ID, logical document key, immutable version, source hash, title and one-based page. Fixed unavailable/busy errors; no raw provider failures.
- Discover the configured downloaded embedding model, select its exact digest/prefix/chunker/dimension identity, and require a complete current corpus. Embed the question with the recorded query prefix and expected identity. Rank normalized vectors by dot product; use bounded lexical overlap plus a conservative documented similarity floor, at most four chunks, no cross-service SQL. Empty/incomplete/incompatible corpus returns uncertainty/unavailability explicitly, never model-prior answers.
- Chat uses the separately configured existing `OLLAMA_CHAT_MODEL`, backend-only fixed loopback `/api/chat`. CPU execution is explicit for this host; no GPU failure retry. Bound context/output, JSON response format, temperature zero, stream false and no thinking. Inspect downloaded model digest before/after generation; reject cloud markers, redirects, oversize/malformed output, model changes, deadline/cancellation.
- Treat question/source text as untrusted data. System rules grant no tools and request only `{quotes:[{source,text}]}` using short S1–S4 aliases mapped exclusively to retrieved opaque chunk IDs. Validate every selected alias, verbatim substring text, quote length/count and query overlap. Build returned citations from trusted repository metadata only. No model-provided titles/pages/URLs or Markdown/HTML rendering. Invalid/unsupported output becomes a fixed staff-referral response. Excerpts do not authorize equipment use or replace staff training.
- One active answer, no waiting queue; a second request returns busy. A 90-second end-to-end knowledge deadline includes retrieval/embedding/chat; gateway has a slightly longer bound and validates status/schema/request ID. Client disconnect/cancel aborts upstream work; release capacity in finally. No automatic retries. Accepted question activity refreshes the kiosk session only after a valid result.
- Browser keeps question/excerpts only in mounted component memory. Cancel/back/reset/expiry/unmount abort work and clear text; guard stale completions. Render plain text, source title/version/page and staff guidance. Typing remains available when voice is absent.

## Ordered commit groups

| Group | Outcome | Verification | State |
| --- | --- | --- | --- |
| 1 | Specification/dependency handoff | Baseline/source/docs audit | In progress |
| 2 | Strict answer contracts | Bounds, normalization, hostile input and response schemas | Planned |
| 3 | Retrieval and constrained local chat | Model compatibility, thresholds, injected/invalid citations, failure/cancellation/digest cases | Planned |
| 4 | Internal route/gateway authorization | Role/CSRF/token/rate/capacity, disconnect and response validation | Planned |
| 5 | Transient kiosk questions | Browser success/uncertainty/failure/cancel/reset/expiry, mobile/desktop review | Planned |
| 6 | Evaluation/runbook/handoff | Real synthetic installed CPU models, known supported/unsupported/injected questions, regressions, source audit/rebase/squash/push | Planned |

## Acceptance criteria

- [ ] Known synthetic questions select correct approved page evidence and immutable citations; unsupported questions refer to staff.
- [ ] Missing/incomplete/changed-model indexes cannot silently mix vectors or answer from model prior knowledge.
- [ ] Unretrieved IDs, invented/modified quotes, spoofed citation metadata, oversized output and injection attempts cannot produce unsupported quoted answers or execute actions.
- [ ] Strict authenticated contracts, role/CSRF/origin/rate limits, one-active/no-queue capacity, bounded work and cancellation are tested.
- [ ] UI plain text and transient data clear on cancel/back/reset/expiry, with useful failure/uncertainty states and accessible responsive layout.
- [ ] No identities from attendance/auth, prompts, source paths or model output enter logs/persistence; attendance remains usable without knowledge/Ollama.
- [ ] Automated checks, real installed-model evaluation, actual limits and operator setup are documented; preserve unrelated staging/history; rebase/squash/push only verified source.

## Evidence

Baseline: branch created from accepted main `32a45cff`, 14 November 2026. Same pinned Node 24.22.2/pnpm 10.34.9 and isolated frozen-installed verification workspace. Existing test-owned loopback/no-cloud Ollama daemon remains available; use installed models only. Implementation/checks pending. No new model download or deployment.

Contract checkpoint — 14 November 2026: strict question/excerpt/citation/uncertainty schemas and fixed `knowledge_unavailable` error are implemented. One focused contract test passes, covering normalization, bounds/control rejection, identity/model/URL/tool extras and strict empty-answer/uncertainty shapes. Focused lint and full strict workspace typecheck pass, including the subsequent sentence-boundary guard. No public route is enabled by contracts alone.

Retrieval/chat checkpoint in progress: five focused contract/retrieval/chat/engine tests pass against fake loopback providers, including compatible/incomplete corpus, unsupported questions, forged source/quote/citation metadata, sentence-fragment refusal, local CPU/JSON bounds, changed/remote/oversize/redirect/unfinished/tool replies and cancellation/capacity release. These are fake-provider results; real chat quality/timing is not claimed yet. Knowledge now explicitly owns the existing pinned Zod 4.6.7 used by contracts; no version/global setting change. Initial tests exposed the missing direct dependency. `pnpm add --offline` hit store/metadata prerequisites, so the existing lock resolution was reused in knowledge's importer; frozen offline install passed with an unchanged lockfile and no downloads. Original staged dependencies remain untouched. Similarity floor 0.35 plus exact lexical overlap is a conservative initial heuristic, to be exercised in real synthetic evaluation.

Primary API references: [Ollama chat](https://docs.ollama.com/api/chat) and [structured outputs](https://docs.ollama.com/capabilities/structured-outputs), checked 14 November 2026. JSON shape is independently runtime-validated; schema generation alone is not trusted citation support.

## Tradeoffs, rollout and rollback

Constrained excerpts sacrifice fluent paraphrasing to make source support mechanically checkable. Similarity/lexical gates are heuristics and must not be presented as proof of policy correctness; evaluation uses synthetic fixtures and real corpus review remains an operator responsibility. No schema change. Removing the feature code leaves the approved MS-003 evidence store intact. AI unavailability cannot block attendance. Public institutional rollout and actual device evaluation remain later tasks.

## Completion record

First groups: specification `7def17b`, strict contracts `c36761e`; both pushed within owner authorization. Knowledge engine preparation passed five focused checks, focused lint, frozen offline install and full strict typecheck. Whole-sentence-boundary validation additionally rejects a source fragment that drops its preceding qualifier; it does not claim full factual/relevance verification. Real evaluation and public routes/UI remain subsequent groups.

Fill actual changed files, checks, model digests/timings, limits and final source audit as groups finish. Next: MS-005 staff history after acceptance; continue remaining dependency-ordered backlog under standing owner authorization.
