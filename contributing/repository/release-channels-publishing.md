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

Releases happen on `canary` and the two long-lived LTS branches
`releases/lts/active` (the current major's release line) and
`releases/lts/maintenance` (the previous major's). The LTS branches are
created manually, once, and from then on a stable release adjusts the refs
automatically. The rules are purely version-based — it never matters which
branch or tag the release was dispatched from:

- The released version is on the latest published major (the npm `latest`
  dist-tag) and newer than everything published in that line:
  `releases/lts/active` moves to the new tag.
- It is on the previous major and newer than everything published in that
  line: `releases/lts/maintenance` moves to the new tag.
- It starts a new major: `releases/lts/maintenance` moves to where
  `releases/lts/active` pointed, and `releases/lts/active` moves to the new
  tag.
- Anything older (or a prerelease channel): no refs move. The "newer than
  everything published in that line" check guards against rewinding a branch
  to an older version of its line.

### Releases based on older tags

To make a change based on an older tag — e.g. a fix for the 15.4.x line once
the 15.x line has moved on — create a branch from that tag. The branch name
does not matter functionally; by convention we use the old
`next-<major>-<minor>` pattern (`next-15-4`), and branches matching
`next-*-*` are covered by the CI push filters, so such a branch needs no
setup. Any maintainer can create it:

```bash
git push origin v15.4.8^{commit}:refs/heads/next-15-4
```

Backport the fix into the branch, then dispatch `Trigger Release` (stable,
`patch`) on it. The release commit advances the branch itself, and no LTS
refs move — newer versions of that major are already published. Publishing is
gated on the tag, which only the release bot can create; since such a version
is below npm `latest`, it is published under the `backport` dist-tag.

For a one-shot release that needs no changes (e.g. a release cut from an
older canary tag), no branch is needed: dispatching `Trigger Release` on a
tag performs a tag-only release — the release commit lands only on the new
tag — and the version-based rules above still move the LTS refs.
