# Next.js Codemods

Next.js provides Codemod transformations to help upgrade your Next.js codebase when a feature is deprecated.

Codemods are transformations that run on your codebase programmatically. This allows for a large amount of changes to be applied without having to manually go through every file.

## Documentation

Visit [nextjs.org/docs/advanced-features/codemods](https://nextjs.org/docs/app/guides/upgrading/codemods) to view the documentation for this package.

## Skip optional feature adoption

`upgrade --skip-adoption` skips codemods marked as feature adoption in the
registry while keeping version migrations and normal dependency selection.
Currently this excludes `cache-components-instant-false` and the
`remove-partial-prefetch` cleanup used after adopting partial prefetching.
Both transforms can still be run explicitly.

Combine it with `--yes` for an unattended version upgrade. Without
`--skip-adoption`, the existing upgrade selections are unchanged.
