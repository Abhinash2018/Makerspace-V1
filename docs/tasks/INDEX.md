# Task index

**MS-000** through **MS-007** are locally accepted. Publication uses retained grouped branch commits and one verified main squash per task. Squashes through MS-006: MS-001 `c616a00` (14 branch commits retained), MS-002 `bbd3fa0d` (19), MS-003 `32a45cff` (12), MS-004 `58fb172` (eight), MS-005 `c43f481` (six), MS-006 `4d4028d` (nine). MS-007's 17 November 2026 evidence records 147 passing automated cases, strict lint/typecheck/build, frozen offline installation, real synthetic CPU matching and real HTTP flow, plus reviewed synthetic-camera desktop/mobile views. On 13–14 November 2026 the owner authorized continuing the backlog in dependency order, separate branches, grouped commits, rebase and one main squash/task, plus verified pushes to `https://github.com/Abhinash2018/Makerspace-V1`. The owner’s 17 November clarification authorizes **[MS-011](MS-011-local-rag-chat.md)**: conversational local PDF RAG, replacing the visible excerpt finder while retaining its API. Other later rows still require specifications and scope changes. Deployment and unrun Linux/Safari/iPad/fresh administrator-only OS-isolation gates remain separate.

MS-007 adds separately consented local face check-in with encrypted template storage, short-lived scoped tickets, attendance-owned receipt retries, withdrawal/expiry and protected staff revocation. It remains disabled by default and independent of manual attendance, photos and Ask. See its task record and final PR/Git refs for the publication/Windows-Linux CI result, including the reproduced Windows short-path development fix. Physical camera/Safari/iPad, real calibration and deployment remain unrun.

| ID | Future branch | Purpose | Depends on |
| --- | --- | --- | --- |
| [MS-000](MS-000-foundation.md) | `chore/MS-000-local-foundation` | Local microservice skeleton, kiosk shell, Ollama diagnostics, CI | None |
| [MS-001](MS-001-access-controls.md) | `feat/MS-001-access-controls` | Local staff sign-in, kiosk sessions, CSRF, authorization, rate limits, session store | MS-000 |
| [MS-002](MS-002-manual-checkin.md) | `feat/MS-002-manual-checkin` | Name/NetID visits, validation, self-reported labeling, idempotency, retention | MS-001 |
| [MS-003](MS-003-document-ingestion.md) | `feat/MS-003-document-ingestion` | Approved local PDFs, page extraction, versioning, local embedding/index pipeline | MS-001 |
| [MS-004](MS-004-grounded-answers.md) | `feat/MS-004-grounded-answers` | Local Ollama evidence excerpts with citations, uncertainty, evaluation, cancellation | MS-003 |
| [MS-005](MS-005-staff-history.md) | `feat/MS-005-staff-history` | Protected paginated visit history, local dates, safe CSV export | MS-002 |
| [MS-006](MS-006-optional-photo.md) | `feat/MS-006-optional-photo` | Separate optional photo consent, private files, protected retrieval and expiry | MS-002, MS-005 |
| [MS-007](MS-007-face-checkin.md) | `feat/MS-007-face-checkin` | Explicit enrollment consent, isolated encrypted templates, match/revoke/expiry flow | MS-002, MS-006 |
| [MS-011](MS-011-local-rag-chat.md) | `feat/MS-011-local-rag-chat` | Conversational local PDF answers, follow-ups, trusted page citations and actual supplied corpus | MS-003, MS-004 |
| MS-008 | `feat/MS-008-offline-voice` | Local speech recognition/synthesis, captions, typed fallback | MS-004 |
| MS-009 | `feat/MS-009-lan-kiosk` | Local-network iPad mode, trusted HTTPS, gateway-only exposure, Safari tests | MS-001, relevant enabled feature tasks |
| MS-010 | `chore/MS-010-local-operations` | Reliable service startup, scheduled cleanup, backups/restore, offline packaging, load checks | Enabled data/AI feature tasks |

Each row becomes `docs/tasks/MS-NNN-description.md` by copying [TEMPLATE.md](TEMPLATE.md) when that task begins. Project documents stay in root `docs/`; runtime code belongs under `local/`. Fill the task before coding and update it in the same branch. Tasks may change order based on dependencies; add an architecture decision when changing ownership or contracts.

MS-003 and MS-004 are separate because loading PDFs is different from generating a grounded answer. MS-002 must work without either of them. Voice and face matching remain optional. No automatic staff-pairing requirement is introduced: the desired kiosk flow stays automatic while staff functions are protected.

Before any real kiosk rollout, complete the relevant access, retention, operational, and device checks; these rows are not permission to skip a deployment gate simply because the UI looks complete.
