# Release Channels and Publishing

Next.js publishes to several release channels. `stable` and `canary` are the two
that most users interact with; `beta`, `release-candidate`, and `preview` are
used in the run-up to a major release and for testing unreleased builds.

## Stable

The stable release is what is installed when you `npm install next`. This channel is used by the majority of Next.js users.

This channel is published at a regular cadence and follows [semantic versioning](https://semver.org).

## Canary

The canary channel has to be explicitly installed by users through `npm install next@canary`.

This channel is published early based on the `canary` branch. It holds all changes that are waiting to be published to the stable channel.

`canary` is used to test the latest features and bugfixes on real-world applications.

By installing `next@canary` from time to time you can check if your application is affected by any changes that have not been published yet.

## Publishing

Publishing is driven by CI, not by a local command. Repository maintainers
trigger the
[`Trigger Release`](https://github.com/vercel/next.js/actions/workflows/trigger_release.yml)
workflow, which takes a `releaseType` (`canary`, `stable`, `release-candidate`,
`beta`, or `preview`) and, for stable releases, a `semverType` (`patch`,
`minor`, or `major`). Canary releases also run automatically on a nightly
schedule.

The workflow bumps the version across all packages and pushes the release
commit and tag. That tag then triggers
[`build_and_deploy.yml`](https://github.com/vercel/next.js/actions/workflows/build_and_deploy.yml),
which builds the packages and publishes them to npm under the dist-tag matching
the channel.

Version bumps are restricted to the release branches listed in
`command.version.allowBranch` in `lerna.json`. `scripts/create-release-branch.js`
adds a new release branch to that list when one is created.
