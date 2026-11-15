# One task, one branch, one Markdown file, one main commit

## Team rule

For every task, create a short-lived branch from current `main`, add its specification under `docs/tasks/`, implement and test on that branch, rebase on updated `origin/main`, and use **Squash and merge** on the pull request. The task document and implementation land together in one main commit.

Rebase updates the feature branch's base. Squash combines the PR's commits when it enters main. GitHub's “Rebase and merge” button is a different merge choice; do not select it for this workflow. Local interactive squashing is optional cleanup, not an additional required step.

Do not create all future feature branches now. Create each from current main when its dependencies have merged. The task file remains in main afterward as the permanent design and verification record.

Current owner authorization (13–14 November 2026): finish each task and continue the backlog in dependency order, with separate task branches, coherent grouped commits, final rebase and one squash per task on main. Push verified groups and completed-task main squashes to `https://github.com/Abhinash2018/Makerspace-V1`; the owner explicitly approved this destination. No repeated per-commit/branch/push approval is needed within this scope. Deployment, destructive deletion, force-pushing main, rewriting another contributor's branch and unrelated machine-wide changes remain outside it. Prepare and inspect concrete changes and actual verification before publication.

Use ordered commit groups on the task branch. Finish one coherent group with its relevant tests and documentation, review its diff, then commit only its intentional paths and push within the standing authorization. Preserve unrelated staging, especially ignored runtime/dependency files already in the index. Do not accumulate the whole task into one development commit. Final squash merging still produces one task commit on main. MS-000's group order and verification checkpoints are in [its task file](tasks/MS-000-foundation.md#ordered-commit-groups).

| Task type | Branch example | Task document | Squash commit example |
| --- | --- | --- | --- |
| Foundation | `chore/MS-000-local-foundation` | `MS-000-foundation.md` | `chore(MS-000): establish local Ollama microservice foundation` |
| Feature | `feat/MS-002-manual-checkin` | `MS-002-manual-checkin.md` | `feat(MS-002): record idempotent manual check-ins` |
| Fix | `fix/MS-020-checkin-retry` | `MS-020-checkin-retry.md` | `fix(MS-020): prevent duplicate visits on retry` |

## Initial foundation in Makerspace-V1

This checkout is `Abhinash2018/Makerspace-V1`, with existing main history and a documentation-only baseline at `ccf3c34`. Add the runtime under `local/` and keep project documents in root `docs/`. The older MakerspaceAssistant application is a separate repository. Do not run an orphan-branch reset, overwrite main, or copy its deployment/data into this checkout. The MS-000 squash commit adds the foundation while preserving this repository's history.

This repository is already initialized; an empty-repository bootstrap exception does not apply.

## 1. Start a task

These examples assume a clean worktree, `origin` is the verified project remote, and `main` exists. Inspect `git status` and `git remote -v` first; preserve unrelated work. Run Git commands from repository root.

```sh
git switch main
git pull --ff-only origin main
git switch -c chore/MS-000-local-foundation
```

For a future task, use its branch name and copy `docs/tasks/TEMPLATE.md` to the task's own filename. Fill in purpose, scope, dependencies, contracts, and acceptance criteria before implementing it. Commit the task file early after approval, then update it as evidence develops.

Use small, understandable commits while working. Stage intentional paths; inspect `git diff --cached` before committing. Do not blindly stage runtime files or credentials. Include the task ID in commit messages and the PR title.

## 2. Publish the task branch when authorized

```sh
git push -u origin chore/MS-000-local-foundation
```

Open a pull request targeting main. Link the task file in the PR description, explain the resulting behavior, list actual validation, and state untested areas. The PR is the review boundary; no routine direct pushes to main.

## 3. Rebase before the final review/merge

For your own task branch with a clean worktree:

```sh
git fetch origin
git rebase origin/main
```

If conflicts occur, inspect both changes and resolve the intended combined behavior. Stage only resolved files, then run `git rebase --continue`. Use `git rebase --abort` if the resolution is not understood. Do not blindly choose “ours” or “theirs,” especially for lockfiles, migrations, contracts, and task evidence.

Run relevant validation again after rebase; previous test results are not sufficient if the base or conflict resolution changed behavior. If main moves again, update and recheck according to the repository's required checks.

For an already-published **personal** task branch, updating its rewritten history requires a guarded force push:

```sh
git push --force-with-lease origin chore/MS-000-local-foundation
```

Never use this on main. Before rebasing a published branch, inspect its remote tip and confirm no one else has added commits. If the lease rejects, stop and inspect the remote changes; do not fetch and retry blindly. A background fetch can weaken the implicit lease's protection, so for collaborative tooling use an explicit lease pinned to the remote SHA inspected before the rewrite: `--force-with-lease=refs/heads/BRANCH:EXPECTED_SHA`, replacing both placeholders. Coordinate before rewriting a shared branch; prefer task branches with one owner.

## 4. Squash merge

When the task criteria and review are satisfied, choose **Squash and merge**. Use a task-ID commit title and summarize the result and validation. Do not use a merge commit or also select “Rebase and merge.”

Suggested repository settings, where the repository plan supports them: require a PR, required CI checks, resolved review conversations, linear history, and an independent approval when another contributor is available. Permit squash merges; disable other merge methods to reduce ambiguity. Block force pushes/deletion of main. These are settings to configure, not settings this document has already changed.

For solo work, record a self-review and passing checks; never invent another person's approval. Required approval rules must reflect the actual team setup.

## 5. Finish and start fresh

```sh
git switch main
git pull --ff-only origin main
```

After confirming the PR is merged and the work is present on main, delete the remote branch in GitHub. A local `git branch -d BRANCH` may refuse because squash merge does not preserve the branch's commit ancestry. Inspect before deletion; use `-D` only for that confirmed merged task branch if needed. Never continue work on the old squashed branch. Start the next branch from updated main.

## PR description template

```markdown
Task: MS-000 — docs/tasks/MS-000-foundation.md

Problem and result:
Explain what this task enables in two or three sentences.

Implementation:
Describe the service/contract changes and meaningful tradeoffs.

Validation:
List checks actually run and their results. Separate mocked, real-model,
offline, Windows, and device tests. State what remains untested.

Risks and rollback:
Describe new dependencies, data changes, and how to reverse this change.
```

Use the task path above, or replace it with the real repository URL after the branch is published. Do not fabricate evidence links.

## References

- [GitHub merge methods](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github)
- [Git rebase](https://git-scm.com/docs/git-rebase)
- [Git force-with-lease semantics](https://git-scm.com/docs/git-push)
