# MS-006 — Optional consented visit photo

| Field | Value |
| --- | --- |
| Status | In progress — specification checkpoint |
| Branch | `feat/MS-006-optional-photo` |
| Dependencies | MS-002, MS-005; main `c43f481693bb6545d249dc4e2dcbb8851696b16b` |
| Owner | Abinash Ghimire; Codex implements authorized backlog |
| Intended squash | `feat(MS-006): store optional consented visit photos privately` |
| Publication | Verified task groups/main squashes to approved Abhinash2018/Makerspace-V1; deployment separate |

## Problem and outcome

Visitors can record a visit without a photo. Offer a separate optional consent/camera/preview/save step after storage confirms check-in. Skipping, camera denial or photo failure must not undo/block a recorded visit. Store a bounded sanitized JPEG privately with the visit, allow consent withdrawal and protected staff viewing/removal, and expire files with the existing 30-day visit retention. This is not face recognition/enrollment; no image reaches knowledge/Ollama.

## Read before coding and baseline

Read [AGENTS.md](../../AGENTS.md), [architecture](../architecture/ARCHITECTURE.md), [workflow](../GIT_WORKFLOW.md), [setup](../LOCAL_SETUP.md), [MS-002](MS-002-manual-checkin.md), [MS-005](MS-005-staff-history.md), attendance migration/retention/history, gateway session/check-in contracts, bounded HTTP/server helpers and receipt/staff UI. Inspected worktree/branch/manifests/scripts. Preserve unrelated staged dependencies/runtime/secrets and PDF moves; use exact-path commits, isolated dependency verification and semantic index audits. No actual credential/database/photo/face/student data is read or copied.

MS-005 landed/pushed as main `c43f481`; six grouped commits remain through `a11adcf4`. Rebase was already current; the 26-path squash index equaled accepted source. Final audit: 18 runtime hashes, 83 links/16 anchors and original staging preserved. All 121 automated checks, lint/typecheck/build and desktop/mobile review passed. Actual spreadsheet apps/Linux/Safari/iPad/fresh administrator-only OS isolation remain unrun. No dependency or migration change in MS-005.

Sharp official docs and public registry identify exact 0.35.5 (Apache-2.0, Node >=20.9). No installed Sharp found. Pin it only in attendance and verify native import/frozen offline reinstall in the temporary copy; review optional binary dependencies/build policy without global installation or unrelated pin changes. Metadata probe failed in restricted networking, then read-only unsandboxed public-registry probe succeeded. No image-processing installation/behavior pass is claimed yet.

## Ownership, consent and proof

Attendance owns photo metadata, sanitized private JPEGs and deletion queue. Gateway owns browser roles/CSRF/rates and constructs trusted session context through explicit HTTP contracts. Shared packages hold schemas/helpers only. No student image, template or production store in Git. No public directory, arbitrary filename/URL fetch, biometric matching, automatic enrollment, door action or occupancy claim.

Reuse the existing visit attempt proof instead of widening the receipt: after success, keep only its random idempotency UUID alongside the opaque receipt, clearing name/NetID/attempt payload. A photo request supplies visit ID/attempt UUID; gateway derives the current session namespace from its CSRF token, exactly as check-in. Attendance verifies the stored attempt digest against that namespace/UUID before codec/file work, then again at publication. Other sessions cannot attach/remove by knowing a visit ID. Upload is limited to five minutes after the visit; withdrawal works for the original active session, while staff can remove any retained photo.

Consent is literal true plus fixed version `visit-photo-v1`; unchecked/absent/old consent fails before storage. UI explains optional visit photo, up-to-30-day project retention and no face enrollment. Camera starts only after consent and an explicit action. Capture preview can be retaken before saving; save is explicit. Stop tracks and clear canvas/buffers on capture/cancel/skip/finish/reset/expiry/unmount. No audio, default camera access, background capture or browser persistence. Browser-camera tests use explicit synthetic fake media, not a physical-camera claim.

## Image/file/database boundaries

- JPEG input only, at most 512 KiB/4 million pixels/2048 per dimension, minimum 32 x 32. Reject malformed/canonical-base64 violations, unsupported formats/oversize/deadline/cancellation with fixed errors. Route-specific JSON limit 750,000 bytes; ordinary routes retain 8 KiB.
- One active codec/no waiting queue. A short-lived child process receives bytes only over bounded IPC, discards stdout/stderr and inherits no service-token/settings environment. Sharp uses one native worker/cache disabled, pixel/header limits, three-second library timeout and five-second parent kill deadline; JS heap 96 MiB. Native memory is not fully bounded by V8; this is not a malware-proof OS sandbox. No remote paths/assets/model downloads.
- Auto-orient/resize inside 640 x 640, re-encode JPEG quality 75 without EXIF/ICC/XMP, maximum 256 KiB. Keep raw-input hash for exact retry and sanitized hash/size/dimensions for integrity; never raw source bytes/metadata. Synthetic codec tests verify real decoding, metadata removal and bounds.
- Append owned attendance migration 3: photo row (one/visit), consent/revocation tombstone, file-deletion queue and visit-delete trigger; enable foreign keys on owned connections. Reject unknown/future/foreign schema. No startup migration/replacement and no operator migration during development.
- Private filename is a server UUID `.jpg`, never request content. Validate runtime parents/leaf, exclusive 0600 write/fsync, atomic metadata publication after processing/proof/quota recheck. No codec inside a DB transaction. Crash-prepared orphan files are inactive; MS-010 owns reviewed orphan recovery/backup lifecycle.
- Same raw-image retry returns the existing photo; changed bytes conflict, never overwrite. Withdrawal is idempotent and records a tombstone preventing delayed uploads from resurrecting it. Queue the owned file before deleting metadata. Retention deletion also queues via trigger/cascade. Reads fail immediately after revocation/expiry even before unlink. Process up to 100 queued files per maintenance sweep/cleanup command; failures stay queued/unready for retry. Count active + queued photos against a 1,000-file quota. Never enumerate/delete unrelated files; no physical SSD/backups erasure guarantee.

## HTTP and UI contracts

- Kiosk `POST /api/v1/visit-photo` with strict visit/attempt/consent/JPEG body; `POST /api/v1/visit-photo/remove` with visit/attempt only. Kiosk role/CSRF/Origin required; gateway adds only its derived namespace and generated internal token/request ID for attendance's fixed `/internal/v1/visit-photo`/`remove` contracts. Upload six/minute and bounded eight-second upstream work; disconnect/cancel propagates to the owned child. No name/NetID/body logs or automatic retry. Recheck session before success.
- Staff `GET /api/v1/staff/visits/:visitId/photo` returns only a retained authorized normalized JPEG; `DELETE` requires staff/CSRF/Origin and removes consented metadata/file access. Attendance uses bounded JSON/base64 envelopes internally, gateway validates byte/hash/mime metadata and emits fixed private no-store image response. No raw path, bearer token, CSV photo or public image link. Separate rate limits; unknown proof/expired/missing photo fails without revealing another visit.
- History adds optional photo availability metadata compatibly; staff loads an image only on request and clears pixels/URLs on role loss/unmount. Visitor receipt stores only opaque proof, never a prior name/NetID. Consent/photo failure offers skip/finish; uncertain save retries the same captured bytes/proof, with no false success. Face consent is a later independent flow.

## Ordered commit groups

| Group | Outcome | Checks | State |
| --- | --- | --- | --- |
| 1 | Specification/dependency handoff | Baseline/docs/source audit | In progress |
| 2 | Pinned local codec | Native import/real synthetic output/frozen install, lock/policy review | Planned |
| 3 | Strict photo contracts/owned migration | Consent/proof/body/response/schema/upgrade/foreign checks | Planned |
| 4 | Codec/private repository/retention | Metadata/size/cancel, proof/replay/conflict/revocation/queue/expiry/paths/quota | Planned |
| 5 | Authenticated HTTP | Kiosk ownership/staff/CSRF/rate/token/bounds/cancel/integrity | Planned |
| 6 | Optional camera/staff UI | Synthetic-media consent/skip/capture/retake/save/remove/expiry and private preview | Planned |
| 7 | Runbook/acceptance/squash | Regressions/static/build/visual/source audit, rebase/squash/push | Planned |

## Acceptance criteria

- [ ] Photo is optional and separate consent precedes camera/storage; no camera/face enrollment on ordinary check-in/skip/denial.
- [ ] Only the owning active visit proof can attach/withdraw; staff-only view/delete; forged/cross-session/cross-origin/CSRF failures expose no photo.
- [ ] Real synthetic JPEG decoding/re-encoding strips metadata and enforces byte/pixel/time/capacity/cancellation limits, without cloud or body logging.
- [ ] Explicit migration/version checks, private path/fsync publication, exact retry/conflict and revocation tombstones preserve data on failure.
- [ ] Expired/revoked photos are unreadable immediately; owned file cleanup queues/retries survive retention/delete failures without touching unrelated files.
- [ ] Camera tracks/canvas/proof/photo pixels clear on cancel/finish/reset/expiry; staff preview is private and transient; prior check-in/history/AI remain independent.
- [ ] Actual synthetic-media/native/browser/static/visual/source-audit evidence and operational/platform limits support acceptance; reviewed grouped commits/squash preserve history.

## Evidence and rollback

Codec dependency checkpoint — 14 November 2026: exact attendance-owned Sharp 0.35.5 installed in the isolated verification copy, with three local platform/runtime packages and 327 lockfile additions for cross-platform optional resolutions. Existing package pins/build allowlist/global settings are unchanged; the original installed/staged dependency tree was not touched. Native pinned Node 24.22.2 reports Sharp 0.35.5/libvips 8.18.7 and successfully encodes/reads a synthetic 64 x 64 JPEG (292 bytes, no EXIF). Frozen offline reinstall passed with an unchanged lockfile. Public package setup metadata/networking is explicit; this is not a camera/storage/consent pass or runtime download.

Specification/metadata inspection only, 14 November 2026; installation/implementation/tests pending. Migration 3 is append-only; reverting code does not undo photo data/files/consent. Preserve SQLite-safe DB plus private files before rollback; do not delete/reset to make readiness green. File modes do not replace Windows ACLs; actual camera/Safari/iPad/Linux remain separate gates. Next: MS-007 independent explicitly consented face enrollment/matching, never automatic use of these visit photos.

Primary references: [Sharp constructor limits](https://sharp.pixelplumbing.com/api-constructor/), [output/metadata defaults](https://sharp.pixelplumbing.com/api-output/), [0.35.5 changelog](https://sharp.pixelplumbing.com/changelog/v0.35.5/), [installation](https://sharp.pixelplumbing.com/install/). Pin/runtime evidence follows; metadata limits are not a full sandbox guarantee.
