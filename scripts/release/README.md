# Releasing a New Version

> [!NOTE]
> This README covers the transition from the old release process to the new one.
> Once the new process is fully stable, this README will be removed and the new process will be documented in the contributing guide.

## Triggering a Release

[`trigger_release.yml`](../../.github/workflows/trigger_release.yml) is a GitHub Actions workflow that triggers the release process based on the given release type.

In the **legacy workflow**, the workflow will create a commit as based on the release type as `vX.Y.Z-canary.N`, `vX.Y.Z-rc.N`, or `vX.Y.Z` and push directly to the `canary` branch which later will trigger the NPM release.

However in the new workflow, it will create a pull request marked `(new)` for the _non-canary_ releases so that the maintainers can review the changes before merging.

To run the new workflow, set `newRelease` to `true` in the `workflow_dispatch` event.

### Dry Run

#### During the Legacy Workflow

During the legacy workflow, we still want to test if the new release process could've replaced the job successfully. The main transition from the old to new is dropping [Lerna](https://lerna.js.org) and using the [changesets](https://github.com/changesets/changesets) for versioning the packages.

Therefore during the legacy workflow, `.changeset/dry-run-version.diff` file will be created to record the changes in the dry run of `changeset version` command.

#### During the New Workflow

However, we still want to test out the new process before fully replacing the old one. Therefore, set `newReleaseDryRun` to `true` in the `workflow_dispatch` event to dry run the new process. This is a feature flag for the new process to run throught the entire process as a dry run.

It will create a commit/pull request marked `(new dry)` and will proceed to dry run the NPM publish and create a draft GitHub Release to be reviewed.
