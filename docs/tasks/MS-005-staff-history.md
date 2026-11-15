# MS-005 — Protected staff visit history

| Field | Value |
| --- | --- |
| Status | Done — Windows acceptance complete; final squash handoff follows |
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
| 4 | Service/gateway routes | Staff/Origin/CSRF/token/rate/upstream/disconnect/expiry | Done `688b3e8` |
| 5 | Transient staff view/download | Native and desktop/mobile browser flows, logout/expiry/data clearing | Done `e1504cd` |
| 6 | Runbook/acceptance/squash | Regressions/static/build, source/staging audit, rebase/squash/push | Checks passed; final docs/audit handoff |

## Acceptance criteria

- [x] Only staff list/export; kiosk/unauthenticated/forged role/cross-origin/CSRF failures expose no rows.
- [x] Bounded keyset pages avoid duplicates across ties/new arrivals, with signed filter-bound/expiring cursors.
- [x] Reads/exports exclude expired visits before cleanup; DST/date bounds and self-reported identities are correct.
- [x] CSV preserves quoting/Unicode, neutralizes formula-leading text, refuses >500 matches and writes no server file.
- [x] Accessible responsive filters/pages/empty/errors/download clear rows/pending work on logout/reset/expiry.
- [x] Existing attendance/check-in/auth/knowledge remain correct; no records/tokens/CSV bodies enter logs/Git.
- [x] Actual checks/screenshots/runbook and final source audit support acceptance; main squash preserves history and pushes only reviewed source (final audit appended below).

## Evidence and operational impact

Final regression/audit — 14 November 2026: all eight native-process cases passed across seven files (43.62 seconds), including prior auth/check-in/ingestion/answer cancellation/lifecycle and new history/export. Together with 92 unit + 16 tooling + five browser cases, total is 121 passed. `task-source-audit.mjs 58fb172` passed 22 committed task paths/18 runtime hashes equal to the tested copy, 81 local links/15 anchors and original staged-entry preservation. Final documentation adds paths/links; rerun after commit. Named-path whitespace checks passed. No private outputs or real records are committed; final squash index must equal this accepted source.

| Check | Actual result | Limits |
| --- | --- | --- |
| `pnpm test` | 16 tooling + 92 unit cases passed across 39 Vitest files | Four concurrent file workers, deadlines/assertions unchanged |
| `pnpm test:integration` | Eight cases passed across seven files, 43.62 seconds | Native independent processes, synthetic private DB/credential only; no AI needed for history |
| `pnpm test:e2e` | Five Chromium flows passed, 43.1 seconds | Production build, no external browser traffic; final desktop/mobile layout inspected |
| `pnpm lint`; `pnpm build` | Passed; build includes strict workspace typecheck | Final UI/browser test source included; no new dependency/schema |
| CSV/DST/retention/security | Focused tests plus native/browser download bytes | Generated bytes tested; no actual Excel/Sheets or universal spreadsheet guarantee |
| Source/staging/docs audit | Final record appended below | Operator data/runtime unchanged; original unrelated staging preserved |
| Platforms/model scope | Windows checked, no new model changes | No Linux/remote CI/Safari/iPad or new administrator-only OS-isolation execution; no deployment |

Final UI checkpoint — 14 November 2026: full five-flow Chromium regression passed in 43.1 seconds after mobile refinement. Reviewed final desktop table/mobile labelled rows with all fields visible and no page overflow. Staff history uses one volatile page, opaque cursor stack and explicit applied filters; no automatic row polling. Logout/reset access updates immediately unmount the component; cleanup aborts work, clears the page and revokes blob URLs/timers. Stale async errors are epoch-guarded as well as successful replies. Actual downloaded synthetic CSV bytes passed formula/quote checks. Full build/strict typecheck and lint passed on this source; tooling/unit 16 + 92 passed. Final native suite remains separate.

UI/regression checkpoint — 14 November 2026: the production staff browser flow passed sign-in, 25/2-row pagination, real CSV download/formula bytes, date-filter empty state, logout, visitor reset and simulated expiry, with empty browser storage/no external requests/page errors. Initial desktop/mobile screenshots were reviewed; mobile's horizontal table was refined to one labelled row layout, preserving table markup/column headers. Full strict typecheck/build and lint pass after this refinement; five-flow browser regression is running. Standalone tooling/unit suite passed 16 + 92 cases across 39 Vitest files; no assertions/timeouts disabled. New browser test itself is included in the latest typecheck. No actual Excel/Safari/iPad/Linux or new OS-isolation claim.

HTTP/native checkpoint — 14 November 2026: three gateway history tests plus four existing attendance route tests passed, including internal token enforcement/strict filters, staff-only role, export CSRF/Origin, duplicate query refusal, metadata stripping, fixed errors, malformed/oversized/redirect/filter/request-ID refusal, separate read/export limits and a pending read that returns no identities after staff expiry. A real separate-process sign-in/history/export/logout test passed (5.29 seconds), with 36 original visits, new-arrival snapshot exclusion, 37-row formula-neutralized export, kiosk/direct-token denial and AI absent. Full strict typecheck/production build and full lint pass for current production code. UI browser test is running separately; no real credentials/records/DB were read.

Repository group is independently verified by four synthetic repository/date/export tests plus the contract check, full strict typecheck and focused lint. All reads are parameterized and bounded; no migration, cleanup side effect, production record or server-side export file. CSV dangerous text uses quoted tab prefixes including NFKC-detected full-width starts; limitations remain explicit. API authorization/UI are later groups, not implied by repository completion.

Strict contract/static checkpoint — 14 November 2026: five focused checks, full strict workspace typecheck and focused contract/repository lint pass, including the canonical HMAC encoding guard. No dependency or schema changes; no public history route is enabled by this group. The response cursor uses the same bounded wire syntax as subsequent requests; signature verification stays attendance-owned.

Contract/repository checkpoint — 14 November 2026: five focused contract/date/history/export tests passed. Calendar filters are explicit 2000–2099 dates, at most 30 inclusive days; query bounds/unknown/duplicate parameters are validated. Attendance uses indexed descending time/UUID pages plus a signed cursor and SQLite rowid high-water snapshot, excluding new inserts even in the same millisecond. Reads/exports independently enforce the rolling UTC retention cutoff without deleting rows. Tests cover 23/25-hour Chicago days and repeated fall-back hours, timestamp ties/new arrivals, cursor filter/key/expiry/tampering, inclusive date bounds, Unicode/CSV quoting/formula prefixes and 500/501-row export behavior. Final canonical signature guard/static checks follow before commit. No real record/DB touched.

CSV choice: tab-prefix dangerous ASCII/full-width formula-leading text inside quoted/escaped fields, following [OWASP's CSV injection guidance](https://community.owasp.org/attacks/CSV_Injection), checked 14 November 2026. This changes those text fields for human spreadsheet viewing and is not a lossless import format or a universal guarantee across spreadsheet applications/save/reopen cycles. Actual Excel/Sheets execution remains unrun; automated checks inspect generated bytes, not a spreadsheet UI.

Completion — 14 November 2026: strict contracts/fixed errors; attendance-owned date/retention/cursor/CSV repository and routes; gateway staff authorization/proxy/download; volatile staff view/filters/paging/blob cleanup; unit/native/browser fixtures; operator/architecture/task documentation. No operator DB read/migration, real records/export or new dependency/schema. Existing retention remains; reverting feature routes/UI leaves visits intact. Cursors contain row/time/filter metadata, never names/NetIDs, and invalidate on service-token rotation. Explicit export copies are outside automated DB deletion and include safe-viewing prefixes, not lossless import data. Final runtime `e1504cd`, full 121-case regression/static/build acceptance passed; final audit/squash SHA recorded after creation. Next: MS-006 optional consented visit photo.
