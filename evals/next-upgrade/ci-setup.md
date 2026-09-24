# Verify upgrade CI setup

The install template is in
`docs/01-app/02-guides/upgrading/agentic-upgrade-ci.mdx`; the implementation is
`.github/workflows/next-upgrade.yml`. The caller references `@canary` after the
reusable workflow merges. Before merge, replace `@canary` in a private test
repository with the PR branch or an exact PR head SHA.

1. Run `actionlint` on both workflow files. Check that the caller has one secret
   input, no policy or tooling version, and no project-specific code.
2. Rehearse `next upgrade --ci` against a single root app. Check the agent copies
   the template, selects the correct secret input, opens or resumes one setup PR,
   and guides credential entry without exposing a value. Rehearse missing GitHub
   permissions, a missing credential, and resuming after the user connects it.
3. In `devjiwonchoi/next-upgrade-playground`, publish the small caller on a
   reviewed setup PR. Add the credential privately and enable Actions PR creation
   if needed. Merge the setup PR, then inspect the workflow-path activation run.
   Until the Next.js PR merges, point the caller at its exact pushed SHA.
4. Inspect the runner evidence separately: provider authentication, actual agent
   execution, no-change behavior, candidate artifact, clean verification, draft
   PR creation, and downstream CI. Dispatch again with an open upgrade PR to check
   duplicate handling. Leave the workflow enabled through the next Monday 09:17
   UTC to observe a scheduled run; a manual run does not prove scheduling.
5. After the reusable workflow merges, switch the caller to `@canary` and run
   another smoke test. Record failures and blocked stages by run URL. Keep real
   credentials out of transcripts and test output.

For Marketplace distribution, GitHub requires a public repository with a root
`action.yml` or `action.yaml`. A reusable workflow is not a Marketplace listing;
package an Action separately if that distribution channel is needed later.
