---
name: deploy-release-test
description: >
  Validate a commit-specific Next.js preview package and manually trigger the
  entire Next.js deployment test suite through the test_e2e_deploy_release.yml
  GitHub Actions workflow. Use only when asked to run the full deploy test suite
  or this workflow specifically from an internal vercel/next.js PR branch. Do
  not use for focused deployment-test sanity checks; run the relevant tests
  locally with pnpm test-deploy instead. Covers resolving the latest branch SHA,
  waiting for vercel-packages, preserving default workflow inputs, dispatching
  the workflow, and verifying the run.
metadata:
  internal: true
---

# Deploy Release Test

Use this skill only when manually running the entire Next.js deployment test
suite for a pull request. Treat package validation as a hard gate: never
dispatch the workflow until the exact commit's redirected tarball responds
successfully.

## Scope

Do not use this workflow to sanity-check one deployment test or a focused group
of tests. Follow
[Running Deploy Tests Locally](../../../contributing/core/testing.md#running-deploy-tests-locally)
instead:

```bash
NEXT_TEST_VERSION=https://vercel-packages.vercel.app/next/commits/<commit-sha>/next pnpm test-deploy <path-to-test>
```

If a request to "run deploy tests" does not explicitly call for the entire
suite, prefer the focused local workflow and scope it to the affected tests.

## Inputs

- Accept a PR number or determine the PR from the current branch.
- Use repository `vercel/next.js` and workflow
  `.github/workflows/test_e2e_deploy_release.yml`.
- Require the PR head branch to exist in `vercel/next.js`. A fork branch cannot
  run this secret-bearing workflow; use the repository's PR adoption process
  first when appropriate.

## Workflow

1. Resolve the PR branch and its latest commit from GitHub, not merely from the
   local checkout:

   ```bash
   gh pr view <pr-number> --repo vercel/next.js \
     --json number,url,headRefName,headRefOid,isCrossRepository
   ```

   If no PR number was supplied, omit `<pr-number>` to detect the PR from the
   current branch. Stop if `isCrossRepository` is `true`. Record `headRefName`
   as the branch and `headRefOid` as the commit SHA.

2. Construct the exact package URL:

   ```text
   https://vercel-packages.vercel.app/next/commits/<commit-sha>/next
   ```

3. Wait for the package to become downloadable before dispatching anything:

   ```bash
   node scripts/wait-for-preview-tarball.mjs --commit-sha <commit-sha>
   ```

   Keep the wait in an ongoing terminal session and poll it so the user still
   receives progress updates. The helper uses `HEAD`, follows the redirect to
   Vercel Blob, and only succeeds when the final artifact is available. Do not
   substitute a check that accepts the initial redirect: that endpoint can
   redirect even while the blob still returns 404.

   If the helper times out or reports an authorization or build failure, do not
   dispatch the workflow. Report the failure and inspect the commit's
   `build-and-deploy` / `upload-preview-tarballs` checks if useful.

4. Resolve the PR again immediately after validation. Compare the current
   `headRefName` and `headRefOid` with the recorded values. If either changed,
   return to step 2 and validate the new commit-specific URL. Never reuse the
   old package URL for a moved branch.

5. Trigger the workflow from the PR branch and pass only `nextVersion`:

   ```bash
   gh workflow run test_e2e_deploy_release.yml \
     --repo vercel/next.js \
     --ref <pr-branch> \
     -f nextVersion=https://vercel-packages.vercel.app/next/commits/<commit-sha>/next
   ```

   Do not pass any other `-f` values. Leaving them unspecified preserves the
   workflow defaults, including `vercelCliVersion: vercel@latest` and empty
   optional overrides.

6. Find and verify the newly created run:

   ```bash
   gh run list --repo vercel/next.js \
     --workflow test_e2e_deploy_release.yml \
     --branch <pr-branch> \
     --event workflow_dispatch \
     --limit 5 \
     --json databaseId,url,status,conclusion,headBranch,headSha,displayTitle,createdAt
   ```

   Confirm that the newest matching run has:
   - `headBranch` equal to the PR branch
   - `headSha` equal to the validated commit SHA
   - `displayTitle` containing the exact commit-specific package URL

   A race can still move the branch between the final check and dispatch. If the
   run's `headSha` differs, report the mismatch and do not trigger another run
   until the new SHA's package has been validated.

## Completion Report

Report the PR branch, validated SHA and package URL, workflow run URL, and its
current status. Do not wait for the full deployment suite unless the user asks
you to monitor it.

## Related Skills

- `$pr-status-triage` - Inspect failures if the deployment workflow does not pass.
- `$create-pr` - Create or update the internal PR branch before deployment testing.
