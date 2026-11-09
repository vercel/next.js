## Before changing files: check for an equivalent open pull request

Only an open pull request with equivalent work can stop this upgrade.

- [ ] If the repository has a provider remote, use its CLI or API to look for
      open pull requests with equivalent work. For GitHub, run
      `gh pr list --state open --limit 100 --json number,title,body,url,headRefName`.
      Inspect the body and diff of likely matches with `gh pr diff <number>`.

An open pull request is equivalent only if it makes the same change to this
app: it carries this app's marker for the same upgrade type, or it performs the
same version update (to this target or newer) or adopts the same Future
Defaults.

```md
<!-- next-upgrade: <type>; path="." -->
<!-- next-upgrade: <type>; path="apps/web" -->
```

Branches, commits, and closed or merged pull requests never stop the upgrade,
even when they attempted the same change; they are often stale or abandoned.
Partial overlap, such as an older target version, another app, or only some of
the requested Future Defaults, is not equivalent work. Mention notable related
work in your report and continue. Do not require Git or a provider remote to
upgrade an app. If the lookup is unavailable or fails, report that and
continue.

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
      pull requests for duplicates. If you find an equivalent open pull request,
      report it and do not publish another PR. If the recheck is unavailable,
      report that and deliver the verified local changes. Otherwise, publish one
      draft PR with the app marker:

```md
<!-- next-upgrade: <type>; path="." -->
<!-- next-upgrade: <type>; path="apps/web" -->
```

- [ ] If the app has no Git repository or provider remote, deliver the verified
      local changes and report that a PR requires a repository and remote.
- [ ] If a PR is possible but permission has not been granted, ask the user
      whether to open one when reporting the completed work.
- [ ] If work is incomplete, report completed work, the blocker, and how to resume.
