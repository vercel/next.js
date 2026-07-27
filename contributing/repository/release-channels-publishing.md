# Release Channels and Publishing

Next.js has two release channels: `stable` and `canary`.

## Stable

The stable release is what is installed when you `npm install next`. This channel is used by the majority of Next.js users.

This channel is published at a regular cadence and follows [semantic versioning](https://semver.org).

Repository maintainers can publish a new stable version using: `pnpm publish-stable`.
The command will ask what version to publish `major`, `minor`, or `patch`.

## Canary

The canary channel has to be explicitly installed by users through `npm install next@canary`.

This channel is published early based on the `canary` branch. It holds all changes that are waiting to be published to the stable channel.

`canary` is used to test the latest features and bugfixes on real-world applications.

By installing `next@canary` from time to time you can check if your application is affected by any changes that have not been published yet.

Repository maintainers can publish a new canary version using: `pnpm publish-canary`.
The command will automatically decide the new version tag as it's an increment from the previous version.
