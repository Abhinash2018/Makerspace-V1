# MS-011 — Conversational local PDF RAG

| Field | Value |
| --- | --- |
| Status | In progress |
| Branch | `feat/MS-011-local-rag-chat` |
| Base | Accepted MS-007 main `720a82d3697c633c619d8130ba1862af44b5157e` |
| Scope | User's 17 November correction: a local chatbot that answers students from the supplied PDFs, with conversational follow-ups |
| Publication | Standing verified branch/rebase/one-squash workflow; deployment separate |

## Outcome and ownership

The previous MS-004 interface selected verbatim excerpts from a synthetic demo corpus. That behavior does not meet the user's clarified expectation. Add generated, conversational answers grounded in the thirteen supplied policy/procedure PDFs, with trusted document/page citations and short verifiable supporting excerpts. Replace the visible question form with a chat thread, persistent composer, Enter to send/Shift+Enter newline, follow-ups, stop, retry and clear/new-chat controls.

Keep the existing excerpt API compatible. Introduce strict browser `POST /api/v1/chat` and token-authenticated knowledge `POST /internal/v1/chat` contracts. Gateway owns role/Origin/CSRF/rates and cancellation; knowledge owns retrieval, local model generation and source mapping. Attendance/face receive no chat inputs. Already installed Mistral and EmbeddingGemma run locally on CPU; no cloud, network search, runtime model downloads, new dependencies or shared domain services.

History is bounded, alternating user/assistant text kept only in mounted browser memory and carried explicitly in each chat request. History is context for follow-ups, never authoritative evidence. It clears on new chat, exit, reset, expiry and unmount. No server conversation storage, localStorage, source-body logging, attendance identities or tools are added. Source PDFs and history remain untrusted model input.

## Retrieval and response contract

Use the existing versioned private PDF/chunk/vector store and complete-index/model-digest checks. Improve retrieval for paraphrases and short follow-ups using semantic plus lexical ranking and bounded source diversity. Context comes only from current approved PDF chunks; unsupported questions must produce an honest source-limited response. Generate natural explanatory text/steps rather than requiring the answer itself to be copied verbatim. A bounded generated answer selects up to four retrieved source aliases. The server attaches the original full retrieved passage (up to 1,000 characters/1,200 UTF-8 bytes) and constructs titles/pages/hashes from trusted repository metadata. The model cannot submit quote text or metadata; strict validation rejects invented/duplicate aliases, extra fields and invalid/oversized output. This avoids unreliable model copying and reduces CPU generation time.

Citation validation verifies the supplied evidence reference, not semantic truth of every paraphrase. Real-corpus evaluation and clear uncertainty remain necessary. No claim of perfect factuality, safety authorization or ChatGPT-equivalent model capability is made.

The user's request explicitly authorizes using the provided PDFs as sources. Inspect/extract the thirteen files under the current `docs/pdfs/` location, then index them explicitly into the private preview corpus. Retire the synthetic demo document from active retrieval while preserving historical files/versions. Do not publish the pre-existing staged PDF moves or copy real visitor/student records, credentials or databases. Record import hashes/counts/empty pages and evaluate actual printer-access/training/rates questions against their source pages.

## Acceptance

- [ ] Real chat UI sends with Enter, supports follow-ups, shows generated responses/citations and keeps the composer available.
- [ ] All thirteen provided PDFs are indexed completely; demo evidence is inactive; the user's 3D-printer-access example gets a useful source-grounded answer.
- [ ] Follow-up context, supported/unsupported questions and real local-model generation are evaluated using the actual corpus and synthetic tests separately.
- [ ] Strict auth/history/source/quote/bounds/model checks, cancellation, private-state clearing and failure recovery pass; no model-prior answer when evidence is missing.
- [ ] Legacy excerpt API and unrelated check-in/photo/face/staff functionality remain compatible.
- [ ] Lint/typecheck/build, relevant unit/process/browser checks, visual inspection and source/staging audit have actual evidence; verified publication follows standing workflow.

## Groups and evidence

1. Clarified specification/strict contracts and corpus review.
2. Local conversational retrieval/generation and authenticated HTTP.
3. Chat UI, supplied-PDF import, real-corpus evaluation and browser checks.
4. Regression/source audit and rebase/squash handoff.

17 November: inspected the branch, relevant manifests/scripts, MS-004 specification, architecture, current excerpt-only implementation and all thirteen supplied PDF filenames. Current Ask uses a demo guide and a copied-quote-only prompt. No production records or new model downloads are required. Tests/import/evaluation are pending and are not marked passed.


### Supplied corpus review/import

All thirteen supplied PDFs were explicitly approved by the user’s request and imported into the private preview. Active demo membership was retired, preserving its historical version/original. The corpus contains 140 PDF pages, with no empty extracted pages. Twelve files use PDF.js; the twelve-page image-only FOM manual uses installed Windows English OCR. Its rendered first page was visually inspected against extraction. Source files remain out of the task commits.

| Document key | Pages | Parser | SHA-256 |
| --- | --- | --- | --- |
| fom-ihm-user-manual | 12 | windows-ocr-en-us-v1 | `3f359c684e82475259e26ff76b7b861fe52a5890abe5dd49300298a3c5ad0ee5` |
| fom-requesting-access-to-new-equipment | 17 | pdfjs-6.5.438 | `0a0a364f2c70167ea65f0f7f24a757de9156eb3a768126e64af1d2b43dcc9887` |
| ingram-hall-makerspace-policies-and-procedures | 6 | pdfjs-6.5.438 | `05ed4e67a352a5a3580fc5c4a216b31f7d6f32b34b4f39f2deb04c6460cd6f36` |
| ingram-hall-makerspace-rates-spring26 | 2 | pdfjs-6.5.438 | `a28371cc569f71f29db0f09f78d58ef04f0bc50ba92706e6f0e4e4fe7bf42ed6` |
| instructor-setup-guide | 3 | pdfjs-6.5.438 | `d2e6ec32c4d5f7cd29bc5cdc005da932087563d3d1300e981546e3d8b28055b5` |
| linkedin-learning-guide | 4 | pdfjs-6.5.438 | `3b83da6c9b65012b89eb4e86c9969b792f0ec83baade9faeedc40a68de597fb9` |
| new-user-sop | 8 | pdfjs-6.5.438 | `f93e70472268bf78dd1504fc3c23390c711cbd6480bfe1dda5f81bb94a559a20` |
| paying-invoices-by-card | 4 | pdfjs-6.5.438 | `1c477e6f69b55ccebbde9cc78d022d842892ee3c01024f15eea89ffa8a9701ec` |
| policies-and-procedures-igrm-1202d | 1 | pdfjs-6.5.438 | `c8c1b5f48183c33b6350837758fe2b25d7c1ada09566e69a4aafa0fdbcb708b5` |
| research-account-setup-guide | 2 | pdfjs-6.5.438 | `b2a04005ac8e72786a3c9c21552b01c4000c8fe02e6f5236625a16ba48acd637` |
| sop-fff-feb26 | 37 | pdfjs-6.5.438 | `40b635f818b647bdb13b825e15c7a7b4cfb389f8814c467ea851d2c6b6c78c97` |
| sop-fff-multimaterial-feb26 | 18 | pdfjs-6.5.438 | `eb1d2ce35fbace76cd58112e5b76b95f272e56fe4430c3080686b33b05ec2cfc` |
| sop-xtool-p2s-sep26 | 26 | pdfjs-6.5.438 | `6573fffeaf978b31177485aeebd0a750b4e3ef21bc589b4d62eb507e2d28c1c4` |

Model adapter evaluation: the installed Qwen3 runner emitted internal reasoning despite `think:false` (also reproduced with `/no_think` and a raw no-thinking prefill). Real requests hit the 90-second deadline; these are failed trials, not accepted evidence. Already installed Mistral produces structured explanations. The first Mistral trials also exposed quote-copying errors and generation cost; source selection now returns aliases only and the server attaches verbatim passages. Two small Qwen2.5 models were subsequently installed by explicit operator CLI pulls for evaluation; their incomplete training/material answers were rejected. The final runtime uses the already installed Mistral model, with a simpler bounded answer/source-ID schema, four retrieved pages, user-question-only model history and a 110-second deadline. No request/startup downloads a model and no host-wide policy was changed. Final evaluation/checks remain pending.

Primary API references: [Ollama chat](https://docs.ollama.com/api/chat), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [generation raw option](https://docs.ollama.com/api/generate), and [Qwen thinking controls](https://github.com/QwenLM/Qwen3).

### Final implementation and verification method

Model generation is a single strict `{answer,sources}` object (1,200 answer characters; zero to four aliases S1–S4). The server rejects empty/fragment/placeholder answers, invented/duplicate aliases, extra fields, truncation and tools, then attaches original passages as the wire response sections. The model uses a 6,144-token CPU context, 400 predicted tokens and a five-minute keep-alive; engine deadline is 110 seconds, knowledge socket/gateway upstream 115 seconds, browser/gateway socket 120 seconds. This fits below the kiosk idle deadline while leaving room for HTTP cleanup. Legacy excerpt deadlines remain unchanged.

Four retrieved distinct pages, at most three per document, keep local CPU work bounded. Semantic ranking supports paraphrases; lexical/intent boosts prioritize prerequisite lists for access/training questions. Recent user questions resolve follow-ups. Assistant texts remain bounded browser conversation state and strict wire history but are excluded from model input to avoid repeating prior model mistakes. The browser retains at most twelve turns and sends three completed pairs; user history turns have the same 500-character/2,000-byte bound as questions.

`pnpm chat:acceptance --cpu --approved-corpus` explicitly evaluates the current thirteen-document corpus with the configured local model. It checks access navigation/training, a training follow-up, a separate reservation question, own-filament/ordinary-printer restrictions and unsupported-password refusal; default output contains only case/status/timing/citation metadata. Add `--review` only for an explicit operator review of generated text. It never imports documents, downloads models or runs as part of ordinary synthetic CI. Phrase checks are regression indicators, not semantic proof; answers are also reviewed against the cited PDF pages.

An initial access assertion required a reservation statement in the answer to a request-access question. The PDF distinguishes requesting equipment access from reserving printing time. The access criterion now verifies the access controls/training; a new, explicit reservation question keeps the original reservation requirement under test. The material case explicitly asks about ordinary printers as well, retaining the PLA/BYOF checks. No required check is skipped or marked passed without running.

Earlier concurrent verification attempts exposed existing short-deadline tests under real-model/download contention: one 40 ms fake-provider inspection returned timeout rather than invalid-response; a later run timed out existing PDF/ingestion cases at 15 seconds while model files were being downloaded/verified. Existing guards/checks were retained. Final isolated idle-runtime regression runs and final real-corpus acceptance are recorded below when complete.
