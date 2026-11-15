# MS-005 — Protected staff visit history

| Field | Value |
| --- | --- |
| Status | In progress — specification checkpoint |
| Branch | `feat/MS-005-staff-history` |
| Owner | Abinash Ghimire; Codex implements the authorized backlog |
| Dependencies | MS-001, MS-002; current main also includes accepted MS-003/MS-004 |
| Base | Local/remote main `58fb172424ba927b60f35a03a31507e74d81494b` |
| Intended squash | `feat(MS-005): provide protected visit history and bounded CSV export` |
| Publication | Verified groups/main squashes to approved Abhinash2018/Makerspace-V1; deployment separate |

## Problem and outcome

Staff can sign in but cannot review self-reported visits. Add staff-only history with Chicago calendar-day filters, stable keyset pages, explicit expiry filtering and a bounded CSV download. Public kiosk and knowledge service must never receive history identities. Clearing staff access removes displayed rows and aborts pending work.

## Read before coding and baseline

Read [AGENTS.md](../../AGENTS.md), [architecture](../architecture/ARCHITECTURE.md), [workflow](../GIT_WORKFLOW.md), [setup](../LOCAL_SETUP.md), [MS-001](MS-001-access-controls.md), [MS-002](MS-002-manual-checkin.md), attendance migration/repository/routes, gateway guards/HTTP helpers, staff UI and synthetic fixtures. Inspected branch/worktree/manifests/scripts. No new dependency/schema migration planned. Preserve pre-existing staged dependencies/runtime/secrets and 13 PDF moves; exact-path commits and semantic index audit continue. Tests use the pinned offline-installed verification copy, never operator records/credentials/databases.

MS-004 is complete and pushed as `58fb172`, eight grouped commits retained through `a1f576f9`. Clean rebase was already current and the 35-path squash equaled the accepted branch. Final audit: 27 runtime paths equal to tested copy, 69 links/13 anchors valid, unrelated index preserved. Acceptance: 16 tooling + 84 unit + seven process + four Chromium tests, lint/typecheck/build, six real synthetic CPU cases. English relevance heuristics require corpus review; OS-isolation/Linux/Safari/iPad/deployment remain separate. Unit runner caps file-level concurrency at four without changing assertions/deadlines.

## Scope and ownership

Attendance owns history SQL, 30-day eligibility, date conversion, signed cursors and CSV formatting. Gateway authorizes staff, rate-limits and validates explicit HTTP contracts; no service imports/DB reads. Shared packages hold wire schemas only. Knowledge/Ollama receive nothing. No visit edits/student search, photos/face features, analytics, occupancy claim, automatic export storage or real-data import. Self-reported labels remain explicit.

## Contracts and behavior

- Browser `GET /api/v1/staff/visits`: strict query `from`/`to` as inclusive `YYYY-MM-DD` Chicago dates (both optional together; absent means retained history), `limit` 1–50/default 25, optional bounded opaque cursor. Reject unknown/duplicate/malformed parameters. Token-authenticated attendance `GET /internal/v1/visits` uses the same validated query. Staff role/Host/Fetch Metadata protection required; reads do not require CSRF.
- Response: request ID, at most 50 strict visit records (UUID, normalized name/NetID, UTC recorded time, self-reported true), nullable next cursor, snapshot UTC and date metadata. No digests/private paths/session tokens. Browser explicitly displays America/Chicago.
- Keyset order is descending timestamp then UUID. Cursor is HMAC-authenticated using an attendance-owned derivation of the existing service token; expires after ten minutes and binds page size/filter/snapshot/last row. Snapshot excludes new arrivals; no OFFSET scans. Reject altered/expired/cross-filter cursors. Every read excludes rows at/before current UTC now-minus-30-days independently of cleanup. A stale cursor cannot reveal expired rows.
- Chicago midnight conversion uses explicit Intl timezone parts and handles 23/25-hour DST days without host timezone assumptions. Clamp date bounds to retention/snapshot. Reject reversed/impossible dates and ranges longer than 30 calendar days. Retention is a project default, not institutional policy approval.
- Browser `POST /api/v1/staff/visits/export`: strict optional date-filter body; staff/CSRF/Origin, three exports/minute. List reads 30/minute within general API quota. Attendance `POST /internal/v1/visits/export` returns a bounded JSON envelope with attendance-formatted CSV, row count/request ID. Maximum 500 retained matches; larger selections fail explicitly and require narrower dates, without truncation. Fixed attachment filename/type; no server export file.
- CSV has static columns, quoted/escaped cells, UTC plus offset-bearing Chicago timestamps, self-reported labels and conservative formula-prefix neutralization for untrusted text. UTF-8 download; blob URLs revoked promptly/on unmount. Export copies need private access/retention handling. Do not claim actual Excel/Sheets verification without running it.
- List bound 64 KiB, export envelope 512 KiB, fixed loopback paths/two-second deadline, no retries/redirects. Disconnect aborts; recheck staff session before sending identities/touching activity. Fixed redacted history/export/export-too-large failures; no raw SQL/paths/rows in logs.
- UI owns volatile rows/filters/cursor stack, explicit Apply/Next/Previous/Refresh/Export and empty/error states. Show self-reported/30-day/Central-time context. Mount only for staff; logout/reset/expiry/unmount aborts and clears rows/download URLs. No localStorage/sessionStorage/background export. Staff access remains independent of AI.

## Ordered commit groups

| Group | Outcome | Checks | State |
| --- | --- | --- | --- |
| 1 | Specification/dependency handoff | Baseline/docs/source audit | Done `677265c` |
| 2 | Strict history/export contracts | Query/date/row/body/extra bounds | Done `5abd528` |
| 3 | Attendance history/date/cursor/CSV | Retention/DST/ties/snapshot/tamper/expiry/500-row/formula cases | Done `6e43678` |
| 4 | Service/gateway routes | Staff/Origin/CSRF/token/rate/upstream/disconnect/expiry | Verified; focused API commit follows |
| 5 | Transient staff view/download | Native and desktop/mobile browser flows, logout/expiry/data clearing | Planned |
| 6 | Runbook/acceptance/squash | Regressions/static/build, source/staging audit, rebase/squash/push | Planned |

## Acceptance criteria

- [ ] Only staff list/export; kiosk/unauthenticated/forged role/cross-origin/CSRF failures expose no rows.
- [ ] Bounded keyset pages avoid duplicates across ties/new arrivals, with signed filter-bound/expiring cursors.
- [ ] Reads/exports exclude expired visits before cleanup; DST/date bounds and self-reported identities are correct.
- [ ] CSV preserves quoting/Unicode, neutralizes formula-leading text, refuses >500 matches and writes no server file.
- [ ] Accessible responsive filters/pages/empty/errors/download clear rows/pending work on logout/reset/expiry.
- [ ] Existing attendance/check-in/auth/knowledge remain correct; no records/tokens/CSV bodies enter logs/Git.
- [ ] Actual checks/screenshots/runbook and final source audit support acceptance; main squash preserves history and pushes only reviewed source.

## Evidence and operational impact

HTTP/native checkpoint — 14 November 2026: three gateway history tests plus four existing attendance route tests passed, including internal token enforcement/strict filters, staff-only role, export CSRF/Origin, duplicate query refusal, metadata stripping, fixed errors, malformed/oversized/redirect/filter/request-ID refusal, separate read/export limits and a pending read that returns no identities after staff expiry. A real separate-process sign-in/history/export/logout test passed (5.29 seconds), with 36 original visits, new-arrival snapshot exclusion, 37-row formula-neutralized export, kiosk/direct-token denial and AI absent. Full strict typecheck/production build and full lint pass for current production code. UI browser test is running separately; no real credentials/records/DB were read.

Repository group is independently verified by four synthetic repository/date/export tests plus the contract check, full strict typecheck and focused lint. All reads are parameterized and bounded; no migration, cleanup side effect, production record or server-side export file. CSV dangerous text uses quoted tab prefixes including NFKC-detected full-width starts; limitations remain explicit. API authorization/UI are later groups, not implied by repository completion.

Strict contract/static checkpoint — 14 November 2026: five focused checks, full strict workspace typecheck and focused contract/repository lint pass, including the canonical HMAC encoding guard. No dependency or schema changes; no public history route is enabled by this group. The response cursor uses the same bounded wire syntax as subsequent requests; signature verification stays attendance-owned.

Contract/repository checkpoint — 14 November 2026: five focused contract/date/history/export tests passed. Calendar filters are explicit 2000–2099 dates, at most 30 inclusive days; query bounds/unknown/duplicate parameters are validated. Attendance uses indexed descending time/UUID pages plus a signed cursor and SQLite rowid high-water snapshot, excluding new inserts even in the same millisecond. Reads/exports independently enforce the rolling UTC retention cutoff without deleting rows. Tests cover 23/25-hour Chicago days and repeated fall-back hours, timestamp ties/new arrivals, cursor filter/key/expiry/tampering, inclusive date bounds, Unicode/CSV quoting/formula prefixes and 500/501-row export behavior. Final canonical signature guard/static checks follow before commit. No real record/DB touched.

CSV choice: tab-prefix dangerous ASCII/full-width formula-leading text inside quoted/escaped fields, following [OWASP's CSV injection guidance](https://community.owasp.org/attacks/CSV_Injection), checked 14 November 2026. This changes those text fields for human spreadsheet viewing and is not a lossless import format or a universal guarantee across spreadsheet applications/save/reopen cycles. Actual Excel/Sheets execution remains unrun; automated checks inspect generated bytes, not a spreadsheet UI.

Specification only, 14 November 2026; implementation/tests pending. No operator DB read/migration, real records/export. Existing 30-day retention/schema unchanged; reverting routes/UI leaves visits intact. Cursors contain row/time/filter metadata, never names/NetIDs, and invalidate on service-token rotation. Explicit export copies are outside automated DB deletion. No deployment or unrun device/spreadsheet behavior claimed. Next: MS-006 optional consented visit photo.
