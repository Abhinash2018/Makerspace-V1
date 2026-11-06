# Task index

Only **MS-000** is specified for implementation now. Future rows reserve IDs and boundaries; they are not full task specifications and no future feature branches should be created yet.

| ID | Future branch | Purpose | Depends on |
| --- | --- | --- | --- |
| [MS-000](MS-000-foundation.md) | `chore/MS-000-local-foundation` | Local microservice skeleton, kiosk shell, Ollama diagnostics, CI | None |
| MS-001 | `feat/MS-001-access-controls` | Local staff sign-in, kiosk sessions, CSRF, authorization, rate limits, session store | MS-000 |
| MS-002 | `feat/MS-002-manual-checkin` | Name/NetID visits, validation, self-reported labeling, idempotency, retention | MS-001 |
| MS-003 | `feat/MS-003-document-ingestion` | Approved local PDFs, page extraction, versioning, local embedding/index pipeline | MS-001 |
| MS-004 | `feat/MS-004-grounded-answers` | Local Ollama answers with citations, uncertainty behavior, evaluation, cancellation | MS-003 |
| MS-005 | `feat/MS-005-staff-history` | Protected paginated visit history, local dates, safe CSV export | MS-002 |
| MS-006 | `feat/MS-006-optional-photo` | Separate optional photo consent, private files, protected retrieval and expiry | MS-002, MS-005 |
| MS-007 | `feat/MS-007-face-checkin` | Explicit enrollment consent, isolated encrypted templates, match/revoke/expiry flow | MS-002, MS-006 |
| MS-008 | `feat/MS-008-offline-voice` | Local speech recognition/synthesis, captions, typed fallback | MS-004 |
| MS-009 | `feat/MS-009-lan-kiosk` | Local-network iPad mode, trusted HTTPS, gateway-only exposure, Safari tests | MS-001, relevant enabled feature tasks |
| MS-010 | `chore/MS-010-local-operations` | Reliable service startup, scheduled cleanup, backups/restore, offline packaging, load checks | Enabled data/AI feature tasks |

Each row becomes `local/docs/tasks/MS-NNN-description.md` by copying [TEMPLATE.md](TEMPLATE.md) when that task begins. Fill it before coding and update it in the same branch. Tasks may change order based on dependencies; add an architecture decision when changing ownership or contracts.

MS-003 and MS-004 are separate because loading PDFs is different from generating a grounded answer. MS-002 must work without either of them. Voice and face matching remain optional. No automatic staff-pairing requirement is introduced: the desired kiosk flow stays automatic while staff functions are protected.

Before any real kiosk rollout, complete the relevant access, retention, operational, and device checks; these rows are not permission to skip a deployment gate simply because the UI looks complete.
