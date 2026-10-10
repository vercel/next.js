## Before changing files: check for duplicates

- [ ] Check the app for an equivalent upgrade or Future Defaults adoption already
      in progress.
- [ ] If the app is in a Git repository, check local branches and commits. If it
      has a remote, also check remote branches and commits.
- [ ] If the repository has a provider remote, use its CLI or API to look for
      open pull requests with equivalent work. For GitHub, run
      `gh pr list --state open --limit 100 --json number,title,body,url,headRefName`.
      Inspect the body and diff of likely matches with `gh pr diff <number>`.

Look for unmarked work and these markers:

```md
<!-- next-upgrade: <type>; path="." -->
<!-- next-upgrade: <type>; path="apps/web" -->
```

Do not require Git to upgrade an app. Attempt each check that applies to the
app's repository and remote. Do not substitute Git history for an available
provider lookup. If a check is unavailable or fails, report which work could
not be checked and continue the upgrade. Stop before changing files only if
you find equivalent work.

## During the upgrade: troubleshoot failures

- [ ] Check the relevant version upgrade guides for troubleshooting sections
      and follow any applicable checklists before verification or delivery.

## Verify

Complete this checklist after updating dependencies and for each Future Defaults
adoption, before moving on to delivery or the next adoption.

- [ ] Confirm dependencies install successfully with the app's package manager
      from its install root (the workspace root for a monorepo). Detect the
      manager from `package.json` and workspace configuration, using lockfiles
      as supporting evidence. Preserve its configured version and dependency
      policies.
- [ ] If an upgrade or adoption command failed, inspect its partial changes,
      resolve the failure, and complete any remaining steps before running
      checks. Do not repeat completed codemods.
- [ ] Confirm the installed Next.js version with `next --version` using the
      app's package manager. It must match the exact target in the prompt.
- [ ] Resolve issues caused by the update or adoption before continuing.

## After all upgrade and adoption steps: commit and deliver

- [ ] If the app is in a Git repository, commit the verified version update
      before Future Defaults adoption. For a different-major update, use one
      commit for each crossed major, containing
      that major's surviving final-target changes. Do not add transitional
      changes solely to make an intermediate version work. Include source and
      target versions in each commit message and explain why and how.
- [ ] Group Future Defaults changes by the default adopted. If the app is in a
      Git repository, explain why and how in each commit message.
- [ ] If the repository has a provider remote, with permission, recheck open
      pull requests for duplicates. If you find equivalent work, report it and
      do not publish another PR. If the recheck is unavailable, report that and
      deliver the verified local changes. Otherwise, publish one draft PR with
      the app marker:

```md
<!-- next-upgrade: <type>; path="." -->
<!-- next-upgrade: <type>; path="apps/web" -->
```

- [ ] If the app has no Git repository or provider remote, deliver the verified
      local changes and report that a PR requires a repository and remote.
- [ ] If a PR is possible but permission has not been granted, ask the user
      whether to open one when reporting the completed work.
- [ ] If work is incomplete, report completed work, the blocker, and how to resume.
