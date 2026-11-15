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
| 1 | Specification/dependency handoff | Baseline/source/docs audit | Done `7def17b` |
| 2 | Strict answer contracts | Bounds, normalization, hostile input and response schemas | Done `c36761e` |
| 3 | Retrieval and constrained local chat | Model compatibility, thresholds, injected/invalid citations, failure/cancellation/digest cases | Done `94e43e6`; quantity hardening pending |
| 4 | Internal route/gateway authorization | Role/CSRF/token/rate/capacity, disconnect and response validation | Done `163d923` |
| 5 | Transient kiosk questions | Browser success/uncertainty/cancel/reset/expiry, mobile/desktop review | Implemented/tested; final screenshots/commit pending |
| 6 | Evaluation/runbook/handoff | Real synthetic installed CPU models, known supported/unsupported/injected questions, regressions, source audit/rebase/squash/push | In progress; expanded evaluation rerun pending |

## Acceptance criteria

- [ ] Known synthetic questions select correct approved page evidence and immutable citations; unsupported questions refer to staff.
- [ ] Missing/incomplete/changed-model indexes cannot silently mix vectors or answer from model prior knowledge.
- [ ] Unretrieved IDs, invented/modified quotes, spoofed citation metadata, oversized output and injection attempts cannot produce unsupported quoted answers or execute actions.
- [ ] Strict authenticated contracts, role/CSRF/origin/rate limits, one-active/no-queue capacity, bounded work and cancellation are tested.
- [ ] UI plain text and transient data clear on cancel/back/reset/expiry, with useful failure/uncertainty states and accessible responsive layout.
- [ ] No identities from attendance/auth, prompts, source paths or model output enter logs/persistence; attendance remains usable without knowledge/Ollama.
- [ ] Automated checks, real installed-model evaluation, actual limits and operator setup are documented; preserve unrelated staging/history; rebase/squash/push only verified source.

## Evidence

Runner contention — 14 November 2026: the expanded standalone full unit suite ran 36 files concurrently and hit the existing MS-003 ingestion test's 15-second budget (83 passed/one timed out). The new suites/focused ingestion checks had passed; no production deadline or test assertion was changed. Added an explicit four-worker file-level runner cap, preserving isolation and the SQLite/password/PDF concurrency checks inside tests. This bounds peak CPU/native-worker/scrypt allocation for developer/CI runs; full rerun follows after the current browser suite. Failure evidence is retained rather than counted as a pass.

Expanded real evaluation rerun — 14 November 2026: all six cases passed after quantity hardening, total 33,063 ms. Training/page 1: 10,672 ms; hours/page 2: 5,369 ms; unsupported password/menu: 599/584 ms; unsupported training duration correctly uncertain: 6,656 ms; instruction-injection question returned approved training evidence/page 1: 7,165 ms. Same recorded model digests, no downloads. The duration failure remains documented above as the reason for the guard. Five focused engine/validator/chat checks passed, including positive stated-duration evidence and rejection of unrelated opening hours. Final strict/static/regression checks follow.

Expanded evaluation failure — 14 November 2026: a sixth real case asking for training duration failed the expected uncertainty assertion; the model selected approved text without the missing duration. This was a relevance failure despite valid citations, not hidden as a pass. Added a deterministic English quantity-question guard requiring an explicit numeric/written amount and matching subject terms in the same selected excerpt, plus prompt guidance and positive/negative amount tests. This conservative heuristic may decline valid synonym/other-language questions; it is not general semantic proof. Focused and real reruns follow before acceptance.

Real CPU evaluation — 14 November 2026: explicit `pnpm answers:acceptance --cpu` passed five synthetic cases in 28,767 ms using installed EmbeddingGemma digest `85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1` and qwen3:4b digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`. Training and hours selected pages 1 and 2 (13,221/5,601 ms); unsupported password/menu questions returned uncertainty without chat (518/609 ms); an instruction-injection question returned only validated training evidence (5,750 ms). Every returned quote/hash/version/page was checked against the synthetic PDF. No model download, real corpus or OS-isolation claim. Quality beyond these cases remains unestablished.

HTTP checkpoint — 14 November 2026: three gateway tests and existing knowledge startup/engine tests passed for kiosk/role/Origin/CSRF, strict upstream-only question context, request-ID/schema validation, fixed redacted failures, six-per-minute work bounds and reauthorization after session expiry during model work. A native separate-process test passed a 5.5-second model response, one-active/no-queue overload, cancellation through browser-facing gateway → knowledge → fake model, capacity recovery and independent attendance liveness. This exposed the shared server's default five-second idle timeout: only the two bounded answer routes now extend their socket deadline; ordinary routes are unchanged. An initial native fixture used a nonexistent gateway URL setting; corrected to its configured host/port, then passed. Full lint and production build/strict typecheck pass including current UI code; browser review follows.

Baseline: branch created from accepted main `32a45cff`, 14 November 2026. Same pinned Node 24.22.2/pnpm 10.34.9 and isolated frozen-installed verification workspace. Existing test-owned loopback/no-cloud Ollama daemon remains available; use installed models only. Implementation/checks pending. No new model download or deployment.

Contract checkpoint — 14 November 2026: strict question/excerpt/citation/uncertainty schemas and fixed `knowledge_unavailable` error are implemented. One focused contract test passes, covering normalization, bounds/control rejection, identity/model/URL/tool extras and strict empty-answer/uncertainty shapes. Focused lint and full strict workspace typecheck pass, including the subsequent sentence-boundary guard. No public route is enabled by contracts alone.

Retrieval/chat checkpoint in progress: five focused contract/retrieval/chat/engine tests pass against fake loopback providers, including compatible/incomplete corpus, unsupported questions, forged source/quote/citation metadata, sentence-fragment refusal, local CPU/JSON bounds, changed/remote/oversize/redirect/unfinished/tool replies and cancellation/capacity release. These are fake-provider results; real chat quality/timing is not claimed yet. Knowledge now explicitly owns the existing pinned Zod 4.6.7 used by contracts; no version/global setting change. Initial tests exposed the missing direct dependency. `pnpm add --offline` hit store/metadata prerequisites, so the existing lock resolution was reused in knowledge's importer; frozen offline install passed with an unchanged lockfile and no downloads. Original staged dependencies remain untouched. Similarity floor 0.35 plus exact lexical overlap is a conservative initial heuristic, to be exercised in real synthetic evaluation.

Primary API references: [Ollama chat](https://docs.ollama.com/api/chat) and [structured outputs](https://docs.ollama.com/capabilities/structured-outputs), checked 14 November 2026. JSON shape is independently runtime-validated; schema generation alone is not trusted citation support.

## Tradeoffs, rollout and rollback

Constrained excerpts sacrifice fluent paraphrasing to make source support mechanically checkable. Similarity/lexical gates are heuristics and must not be presented as proof of policy correctness; evaluation uses synthetic fixtures and real corpus review remains an operator responsibility. No schema change. Removing the feature code leaves the approved MS-003 evidence store intact. AI unavailability cannot block attendance. Public institutional rollout and actual device evaluation remain later tasks.

## Completion record

Final browser/unit checkpoint — 14 November 2026: all four production Chromium flows passed, including the existing authentication/check-in/service-loss regressions and new evidence/uncertainty/unavailability/cancel/back/expiry flow. External browser requests were blocked and browser storage remained empty; literal source HTML rendered as text. Reviewed final desktop and 390-pixel mobile evidence screenshots after button spacing refinement, with no overflow. Full standalone unit/tooling rerun with four concurrent test workers passed all 84 + 16 cases; test timeouts and explicit internal concurrency checks are unchanged. The final seven-process suite is running separately. No actual Safari/iPad/Linux or new OS firewall-isolation pass.

Quantity/evaluation group: six-case real installed CPU evaluation and five focused engine/chat/validator checks passed after the relevance fix. Full strict typecheck/production build and lint passed on the same source, including current browser code. Manual evaluation is opt-in through `answers:acceptance --cpu`, uses disposable synthetic data and prints bounded metadata only. This fixes the observed missing-duration case without treating the model's confidence as evidence.

HTTP group verification is complete: five focused gateway/knowledge tests passed, including direct internal token enforcement, strict body rejection and missing-model fixed failure. The native >5-second/cancel/overload check passed. Current full lint/typecheck/build passed before the final added internal-route assertions (which passed focused execution). Browser evidence flow also passed against separate real services and a fake local model; desktop/mobile captures show readable text, with a small button-spacing refinement prepared for final review. No production model/data configuration was modified.

First groups: specification `7def17b`, strict contracts `c36761e`; both pushed within owner authorization. Knowledge engine preparation passed five focused checks, focused lint, frozen offline install and full strict typecheck. Whole-sentence-boundary validation additionally rejects a source fragment that drops its preceding qualifier; it does not claim full factual/relevance verification. Real evaluation and public routes/UI remain subsequent groups.

Fill actual changed files, checks, model digests/timings, limits and final source audit as groups finish. Next: MS-005 staff history after acceptance; continue remaining dependency-ordered backlog under standing owner authorization.
