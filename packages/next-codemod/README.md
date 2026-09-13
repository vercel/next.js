# Next.js Codemods

Next.js provides Codemod transformations to help upgrade your Next.js codebase when a feature is deprecated.

Codemods are transformations that run on your codebase programmatically. This allows for a large amount of changes to be applied without having to manually go through every file.

## Documentation

Visit [nextjs.org/docs/advanced-features/codemods](https://nextjs.org/docs/app/guides/upgrading/codemods) to view the documentation for this package.

## Explicit upgrade choices

`upgrade` accepts `--yes` for noninteractive execution. Use an exact Next.js target
with these optional controls when the calling workflow already selected a scope:

- `--react-version <version>` selects a published React/React DOM pair compatible
  with the target and the app's router.
- Repeat `--skip-codemod <name>` to exclude named transforms from the recommended
  set. Unknown names fail before changes are written.
- `--no-turbopack` suppresses the optional adoption suggestion. When crossing
  into Next.js 16, it adds `--webpack` to simple `next dev`/`next build` scripts
  that relied on the old default, preserving explicit bundler flags. Custom shell
  commands are unchanged and receive a migration diagnostic for manual review.

Without these controls, the existing upgrade choices are unchanged.
