Upgrade the Next.js app at <app-directory> in GitHub Actions.

Read the app's instructions and determine its package manager, declared tool versions and package runner. Resolve the repository's default branch and work from it in this checkout. The workflow has prepared the tools and existing dependencies. Preserve the configured temporary caches and tool prefix when installing upgraded dependencies or additional tools. Do not change the manifest or lockfile merely for setup, or redirect a repository-managed Yarn cache.

Use the app's package runner to execute `next@canary upgrade --agent`. Follow its complete instructions, including duplicate checks, upgrade policy, release-age policy, verification, commits and draft PR delivery. Use the current checkout rather than creating another worktree.

This CI task authorizes pushing an upgrade branch and opening one draft PR against the repository's default branch after the upgrade and all applicable verification succeed. Reuse the existing guide's app marker and recheck for equivalent work before publication. If equivalent work already exists or no update is needed, explain that and finish without creating another PR. Preserve existing work and do not force-push over someone else's changes. Never merge the PR or mark it ready for review.

Use the supplied GitHub authentication for Git and `gh`. Configure a local commit identity if the runner needs one. Commit only intended upgrade changes; exclude files created solely by installation, caches, credentials and unrelated work. Never print credentials, embed their values in prompts or command arguments, or commit them.

Run the CLI's completion command as instructed. Do not report success if verification fails. If a prerequisite or permission is unavailable, stop and explain the blocker rather than waiting for interactive input. Finish with the actual outcome and PR URL when one was created.
