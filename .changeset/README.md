# Changeset Configuration

> [!NOTE]
> This README explains the repository's changeset configuration.
> For information about the `@changesets/cli`, please refer to the [official documentation](https://github.com/changesets/changesets).

## `config.json`

> See [changeset config](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md) for options.

### `fixed`

The Next.js repository uses the [`fixed`](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md#fixed-array-of-arrays-of-package-names) option to couple the `@next/swc` and `next` versions since the native binaries are part of Next.js and are published together.
