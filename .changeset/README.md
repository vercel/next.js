# Changeset Configuration

> [!NOTE]
> This README explains the repository's changeset configuration.
> For information about the `@changesets/cli`, please refer to the [official documentation](https://github.com/changesets/changesets).

## `config.json`

> See [changeset config](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md) for options.

### `fixed`

Next.js repository uses the [`fixed`](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md#fixed-array-of-arrays-of-package-names) option to couple the packages' versions. This behavior is meant to drop-in replace the legacy release process using Lerna. In the future, we can decouple the versions per package.

### `changelog`

The [`changelog`](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md#changelog-false-or-a-path) option is set to `false` for canary releases to prevent updating the `CHANGELOG.md` file. This is because canary releases are scheduled daily, which would rapidly increase the length of the `CHANGELOG.md` file.
