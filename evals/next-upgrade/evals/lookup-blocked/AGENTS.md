# Repository notes

Local commits are permitted. Publishing changes requires separate authorization.

This project uses Webpack. Preserve that bundler choice.

This application runs through the development server; a production build is not a supported deployment path.

## Repository host

This checkout uses a read-only test adapter instead of a network Git remote:

- `node /tmp/next-upgrade-tools/provider-fixture.cjs repository` returns the repository, base branch and app identity.
- `node /tmp/next-upgrade-tools/provider-fixture.cjs list-open-prs` returns open pull-request summaries and pagination information.
- `node /tmp/next-upgrade-tools/provider-fixture.cjs inspect-pr <number>` returns a pull request and its diff.

The adapter supplies controlled repository data for this environment.
