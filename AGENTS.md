# Contributor and AI instructions

These rules apply to the new `local/` project. Honor applicable repository instructions too.

1. Read the current task file and architecture before changing code. Work on one task branch. On 13–14 November 2026 the owner authorized finishing tasks and continuing the backlog in dependency order, separate task branches, grouped commits, rebase and one main squash/task, with verified pushes to `https://github.com/Abhinash2018/Makerspace-V1`. The owner's 17 November correction makes conversational local PDF RAG the current scope; see `docs/tasks/MS-011-local-rag-chat.md`. MS-007 is accepted. Deployment remains separate.
2. Inspect the worktree, current branch, manifests, and existing scripts first. Preserve unrelated edits and the legacy app. Never delete history, replace main, or bulk-rewrite the old application.
3. Keep gateway, attendance, and knowledge in separate processes with explicit HTTP contracts. Shared packages contain schemas and small technical helpers, never domain services or database models.
4. All runtime dependencies must be local. No OpenAI, ElevenLabs, Cloudflare D1/R2, hosted vector databases, CDN assets, cloud model fallback, or analytics in the new runtime.
5. Ollama is backend-only and loopback-only initially. Never expose a general-purpose proxy to its API. Never download models on an incoming request.
6. Default to synthetic fixtures. Do not copy student records, photos, face templates, credentials, or production databases into the new workspace.
7. Keep secrets and runtime files out of Git. Validate environment variables at startup; do not log bodies, secrets, identities, or prompts by default.
8. Each task needs objective acceptance criteria, relevant automated checks, and an updated evidence section. Do not mark blocked or unrun tests as passed.
9. Explain important choices, changed files, actual verification, and remaining limitations in the task file and handoff. Document contract changes with the code.
10. Never disable failing checks to make CI green. Investigate failures; report existing failures separately with evidence.
11. Use rebase to update a private task branch, then Squash and merge for one commit on main. Never force-push main or rewrite another contributor's branch.
12. The specification does not itself grant permission to publish, deploy, or push. Follow the user's active request. If asked only to prepare code, finish the reviewable result locally.

Completion means the task's criteria are met with evidence, not that the assistant produced a large number of files.
