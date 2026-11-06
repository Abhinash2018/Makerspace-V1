# MS-NNN — Short task name

Copy this file for each new task. Do not implement from an unfilled template.

| Field | Value |
| --- | --- |
| Status | Proposed / Ready / In progress / In review / Done / Blocked |
| Branch | `feat/MS-NNN-short-name` |
| Owner | Name |
| Dependencies | IDs that must already be merged |
| Task path | `docs/tasks/MS-NNN-short-name.md` |
| PR | Add real URL when created |
| Intended squash commit | `feat(MS-NNN): describe resulting behavior` |

## Problem and outcome

Who needs this, what happens today, and what should happen after this task? Use a concrete example a non-author can understand.

## Scope

List exactly what this branch implements. List explicit exclusions that prevent the task expanding into adjacent features.

## Read before coding

Read root `AGENTS.md`, `docs/architecture/ARCHITECTURE.md`, `docs/GIT_WORKFLOW.md`, the owning service's documentation, and relevant existing code/tests. Runtime paths are relative to `local/`; task documents stay in root `docs/tasks/`. Identify assumptions that must be checked in source.

## Design and boundaries

- Owning service and why it owns this behavior:
- Callers and affected contracts:
- HTTP methods/paths, request/response schemas, validation, and error codes:
- Data owned, schema/migrations, retention, and deletion:
- Authorization and caller identity:
- Idempotency/concurrency/retry behavior:
- Offline behavior and dependency failure behavior:
- Performance limit and measurement plan:
- Compatibility with existing consumers:

Use a compact Mermaid diagram only if it makes the interaction clearer. Explain any changed architecture decision and its tradeoffs.

## Implementation plan

1. Inspect the current code and record the baseline.
2. Define ordered commit groups, each with a coherent outcome, proposed message, and relevant checks. Include tests and documentation with the behavior they verify.
3. Implement and verify one group, inspect its diff, and request approval before committing its intentional paths. Continue with the next group after that checkpoint.
4. Record task-wide acceptance evidence and prepare the PR description.
5. Request approval for publication, rebase, and merge separately. Recheck after an approved rebase; use Squash and merge when acceptance and review are satisfied.

| Order | Outcome and proposed commit message | Verification before commit | Status / actual commit |
| --- | --- | --- | --- |
| 1 | Fill for this task | Fill | Planned |

## Acceptance criteria

- [ ] Given … when … then …
- [ ] Dependency failure produces …
- [ ] Unauthorized/invalid input produces …
- [ ] Offline execution requires only …
- [ ] Relevant existing behavior remains correct.

Make each item observable. “Works well” and “scalable” alone are not acceptance criteria.

## Verification evidence

| Check | Exact command or procedure | Actual result | Evidence / limitations |
| --- | --- | --- | --- |
| Unit / integration | Fill | Not run | Fill |
| Failure paths | Fill | Not run | Fill |
| Offline / real model if relevant | Fill | Not run | Fill |
| Device / platform if relevant | Fill | Not run | Fill |

## Contributor explanation

Explain the request/data flow in plain language, one tradeoff considered, and one failure case. This lets another contributor understand the result without relying on the AI chat.

## Rollback and operational impact

State whether code can be reverted safely, whether schema changes are backward compatible, what happens to newly created data, and what backup/recovery is required. Do not assume reversing a commit reverses a migration.

## Completion record

- Changed files and their purpose:
- Decisions made during implementation:
- Unresolved limitations/blockers:
- Follow-up task IDs:
- Verified commit/revision and date:

Mark Done only when evidence supports all required acceptance criteria. Keep this file after merge. Add the final merge SHA in a later documentation update if needed; do not fabricate a future SHA.
