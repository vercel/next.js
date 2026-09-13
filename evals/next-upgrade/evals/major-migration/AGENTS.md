# Repository notes

Local commits are permitted. Publishing changes requires separate authorization.

This project uses Webpack. Preserve that bundler choice.

The viewer is specific to each request. Image previews must support quality 60 through the image optimizer.

## Repository host

This checkout uses a read-only test adapter instead of a network Git remote:

- `node /tmp/next-upgrade-tools/provider-fixture.cjs repository` returns the repository, base branch and app identity.
- `node /tmp/next-upgrade-tools/provider-fixture.cjs list-open-prs` returns open pull-request summaries and pagination information.
- `node /tmp/next-upgrade-tools/provider-fixture.cjs inspect-pr <number>` returns a pull request and its diff.

The adapter supplies controlled repository data for this environment.
