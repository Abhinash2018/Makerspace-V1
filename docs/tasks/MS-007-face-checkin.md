# MS-007 — Optional local face check-in

| Field | Value |
| --- | --- |
| Status | In progress — specification and dependency inspection |
| Branch | `feat/MS-007-face-checkin` |
| Dependencies | MS-002, MS-006; main `4d4028d13a16c83706a373b642e7774ba5083e11` |
| Owner | Abinash Ghimire; Codex implements authorized backlog |
| Intended squash | `feat(MS-007): add separately consented local face check-in` |
| Publication | Grouped commits and main squash to approved Abhinash2018/Makerspace-V1; deployment separate |

## Problem, scope and baseline

Offer an optional returning-visitor check-in after a separately consented enrollment. Manual check-in remains available without face models, face service, camera or knowledge. Face matches are fallible associations with self-reported identity, never university verification, liveness, access authorization, door unlocking or occupancy. Existing visit photos never enroll anyone automatically. No student images/records/templates or operator credentials/DBs are used during development.

Read [AGENTS.md](../../AGENTS.md), [architecture](../architecture/ARCHITECTURE.md), [workflow](../GIT_WORKFLOW.md), [setup](../LOCAL_SETUP.md), [MS-002](MS-002-manual-checkin.md), [MS-006](MS-006-optional-photo.md), configuration/launcher/migration/runtime fixtures, attendance idempotency/proof, HTTP/auth/rates and camera UI before changing runtime code. Inspected branch, worktree, manifests and scripts. Preserve unrelated staged dependencies/runtime/secrets and PDF moves with exact-path commits and semantic index audits; do not repair the primary installed dependency tree.

MS-006 landed/pushed as `4d4028d`, retaining nine grouped commits through `dc9dbaed`. Rebase was already current; the 45-path squash index equaled the accepted feature tree. Audit verified 37 runtime hashes, 96 links/19 anchors and original staging preservation. All 136 automated checks, strict typecheck/lint/build and synthetic-camera desktop/mobile review passed. Physical camera/Safari/iPad/Linux/remote CI and fresh administrator-only OS isolation remain unrun.

## Ownership and activation

Add a fourth independent loopback Node face service, optional `FACE_ENABLED=0` by default, port 3003 and literal-loopback `FACE_URL` validated alongside existing endpoints. Face owns its DB, encrypted enrollment/identity/template payloads, private encryption key, pinned local model assets/settings and short-lived match tickets. Attendance owns visits and checks proofs through HTTP, never face SQL/imports. Gateway owns browser role/CSRF/Origin/rates/session scope. Shared packages contain wire schemas and small cryptographic/HTTP helpers only. Knowledge/Ollama receive no face, identity or attendance inputs.

Explicit `pnpm face configure --approved --detector <local-file> --recognizer <local-file>` validates the exact model hashes, copies them into owned private storage and exclusively creates settings plus a random 256-bit encryption key. Refuse overwrite, URLs/UNC/symlinks, foreign/oversized models and partial invalid configuration; never silently regenerate a missing/lost key. No setup/start/request model download. Explicit migrations own the new face schema and attendance's face-attempt metadata. Disabled/unconfigured face does not make ordinary attendance/knowledge readiness fail. Operator deployment/real enrollment remains separate from this code task.

## Local model and resource design

Inspect exact attendance-compatible Sharp 0.35.5 and face-owned ONNX Runtime Node 1.31.1 (MIT; public registry metadata reports CPU binaries and a postinstall script). Review packaged script/binaries before executing anything; retain the existing build allowlist unless a reviewed native step is actually required. Do not change unrelated pins/global package settings. Verify native CPU import, frozen offline reinstall and lock stability in the isolated copy.

Pinned OpenCV Zoo revision `48b10fa505aeb51fbd127fc60a5c660040e823b7` provides:

| Asset | Bytes | SHA-256 | License |
| --- | --- | --- | --- |
| `face_detection_yunet_2023mar.onnx` | 232589 | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` | MIT (Shiqi Yu) |
| `face_recognition_sface_2021dec.onnx` | 38696353 | `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79` | Apache-2.0 |

Use fixed YuNet 320 x 320 BGR float input and its twelve stride heads, deterministic score/NMS decoding, five-landmark similarity alignment and 112 x 112 RGB float input to SFace. The SFace graph accepts raw pixel values; do not invent external mean/scale normalization. Normalize its finite 128-dimensional output before cosine comparisons. Verify actual tensor names/shapes/dimension with the downloaded pinned assets before finalizing contracts; refuse mismatch instead of adapting silently.

Each enrollment/match uses a short-lived CPU-only child with filtered environment, no stdout/stderr/body logs, one active operation/no queue, 12-second parent kill budget, bounded JS heap and two native threads. Input is JPEG only, at most 512 KiB/4 million pixels/2048 per dimension; never accept a path/URL from HTTP. Auto-orient, decode to bounded pixels, reject zero/multiple/low-confidence/small faces, invalid landmarks/alignment and clearly inadequate brightness/contrast. No original/crop is persisted. Native memory and presentation attacks are not completely bounded/prevented by these guards.

Initial matching policy is deliberately conservative: cosine at least 0.65 and at least 0.10 separation from the next active enrollment, otherwise no match/manual fallback. Duplicate-identity or highly similar enrollment conflicts require explicit removal, never silent replacement. Thresholds/model/preprocessing identity are immutable settings and bind stored templates. Synthetic real-model same/different/transformed/blank/multiple-face evaluations and deterministic ambiguity tests must support the implementation; they do not establish demographic accuracy or a production false-match rate. Real institution-approved calibration remains a deployment gate. No liveness claim: a photograph/video may spoof the camera.

## Consent, storage and revocation

Only a confirmed manual visit's original active namespace/attempt proof within five minutes may enroll. Gateway passes derived context; face obtains self-reported name/NetID through attendance's authenticated fixed enrollment-identity endpoint, both before preparation and immediately before publication. Explicit unchecked consent must name face matching, encrypted template/self-reported identity storage for up to 90 days, withdrawal, manual alternative and spoofing/false-match limits. Photo consent does not count. Camera and enrollment submission are explicit. No mandatory staff pairing is added.

Face's versioned SQLite store holds opaque IDs/timestamps/model identity, keyed identity/attempt/revocation digests and AES-256-GCM ciphertext containing identity plus normalized embedding. Fresh nonces and authenticated row/version/model context prevent swapping or tampering; wrong/missing key or corrupt ciphertext fails closed. Raw JPEGs, names, NetIDs, descriptors and revocation secrets never appear as plaintext SQLite fields, logs, URLs or browser storage. A 1,000-enrollment quota bounds gallery work. Keyed digests remain sensitive linkage data; encryption does not defend against compromise of the running OS/key account.

Enrollment is idempotent for the same original proof/image; changed-image retry conflicts. It returns an opaque enrollment ID, expiry and random withdrawal code, which the visitor may keep privately; store only its keyed digest. The current original receipt can withdraw, the code can withdraw later without exposing identity, and staff can list a bounded protected enrollment page/revoke by opaque ID. Invalid withdrawal codes give the same safe result. Tombstones block delayed in-flight publication; deletion clears identity/template ciphertext immediately. Read/match always enforce 90-day expiry; startup/hourly/explicit cleanup removes expired metadata. Matching does not extend consent. Backups/key recovery and physical-media erasure remain MS-010 concerns.

## HTTP proof and attendance boundary

All internal routes require the existing local service token; all browser mutations require active kiosk/staff role, Origin and CSRF. Gateway strips supplied identity/scope/token headers, sets fixed trusted context and bounded route-specific bodies/deadlines. Never expose model files/templates or a general-purpose inference endpoint.

- Kiosk `POST /api/v1/face/enroll` supplies original visit/attempt proof, explicit versioned consent and JPEG. `POST /api/v1/face/withdraw` supplies original enrollment proof or a withdrawal code. No request may select an identity to match.
- Kiosk `POST /api/v1/face/match` supplies an explicit camera JPEG plus new idempotency UUID. Return only no-match/uncertain or an opaque signed ticket, never another person's identity/template/scores. Ticket claims bind audience, expiry (30 seconds), random nonce, session namespace and attempt UUID, signed using a purpose-derived HMAC key from the existing trusted internal token. This is not stronger isolation than that shared-token trust boundary.
- Kiosk `POST /api/v1/face/checkin` submits that same ticket/attempt. Attendance verifies its strict signature/context/time, then calls fixed face `POST /internal/v1/face/consume` to recheck current enrollment generation/consent/expiry before receiving identity. Face ticket state is bounded process memory, replayable only for that same attempt until expiry, and lost on restart. A valid match never directly writes attendance's DB.
- Attendance appends face-attempt metadata in the same transaction as its visit, binding the exact ticket digest to the existing namespace/idempotency digest. Lost successful replies can confirm that exact retained receipt after ticket expiry/face outage; different tickets/attempts conflict. A manual attempt cannot be reinterpreted as a face receipt. No DB transaction spans HTTP/model work. Revocation's authorization point is consumption; independent services do not claim a distributed transaction.
- Attendance `POST /internal/v1/face/enrollment-identity` verifies original visit proof/window without importing face code. Face's consume response is a narrow strict identity contract; the browser never sees it. Staff `GET /api/v1/staff/face/enrollments` returns at most 25 active decrypted records with validated opaque after-ID pagination (no stable snapshot promise); `DELETE /api/v1/staff/face/enrollments/:id` requires CSRF. No export/template endpoint.

Use fixed failures/no-match labels, six enrollment/match attempts per minute, separate withdrawal/staff limits and post-upstream session reauthorization. Disconnect/cancel propagates to the owned worker; no automatic retries. Camera/canvas/proof/ticket/withdrawal-code UI state clears on cancel/finish/reset/expiry/unmount. Same-attempt retry after an uncertain attendance reply remains explicit, without false success or silent duplicate visits. Ordinary manual check-in/photo/history/questions continue if face is absent.

## Ordered groups and acceptance

| Group | Outcome | Relevant verification | State |
| --- | --- | --- | --- |
| 1 | Specification/model/license/previous-task handoff | Read baseline; pin hashes; docs/source audit | In progress |
| 2 | Local dependencies/model settings/CPU pipeline | Native import, frozen offline install, actual synthetic detection/embedding and rejection | Planned |
| 3 | Encrypted repository/consent/migration/cleanup | Key/tamper/privacy, idempotency/duplicate/quota/revocation/expiry/ambiguity | Planned |
| 4 | Optional process and authenticated contracts | Loopback/config/launcher, role/CSRF/limits, signed scope/consume/receipt retries | Planned |
| 5 | Explicit enrollment/match/withdraw/staff UI | Synthetic camera lifecycle/manual fallback/private state clearing | Planned |
| 6 | Runbook/full acceptance/rebase/squash | Full regressions/static/build, real synthetic model evaluation, visual/source audits | Planned |

- [ ] Explicit independent face consent precedes enrollment/camera; manual/photo flows never enroll automatically.
- [ ] Pinned local CPU models perform real synthetic detection/embedding with documented quality/ambiguity/no-match limits and no runtime download.
- [ ] Identity/templates are authenticated encrypted at rest; invalid key/model/ciphertext and quota/foreign schema fail closed.
- [ ] Original enrollment proof, own withdrawal code and staff role are enforced; revocation/expiry block later matches/prepared publication.
- [ ] Signed short-lived context-bound consume plus atomic attendance attempts prevent forged/cross-session/replayed-conflicting check-ins and safely confirm a lost success.
- [ ] Optional process/model/camera failures preserve manual attendance/photo/history/questions; UI clears private state/tracks on exit/expiry.
- [ ] Actual automated/native/browser/visual/source evidence, grouped pushes and one main squash support acceptance with unrun device/deployment limits recorded.

## Evidence and rollback

14 November 2026: specification and public metadata/license/LFS inspection only. Branch created from the exact accepted MS-006 main squash. No face dependency installed, model downloaded, biometric implemented or accuracy test passed yet. Model output dimension/preprocessing/native package behavior remain verification items. Do not label this feature production-ready based on synthetic results. Reverting code must preserve encrypted DB/key/model settings together; never regenerate a key or reset a DB to bypass readiness.

Primary references checked: [OpenCV Zoo pinned detector](https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet), [pinned SFace and license](https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_recognition_sface), [OpenCV detector implementation](https://github.com/opencv/opencv/blob/4.x/modules/objdetect/src/face_detect.cpp), [recognition alignment/input implementation](https://github.com/opencv/opencv/blob/4.x/modules/objdetect/src/face_recognize.cpp), [ONNX Runtime Node CPU platforms](https://onnxruntime.ai/docs/get-started/with-javascript/node.html), [exact package metadata](https://registry.npmjs.org/onnxruntime-node/1.31.1). Model licenses do not establish institutional biometric-policy approval.
