# Developing

- The development branch is `canary`.
- All pull requests should be opened against `canary`.
- The changes on the `canary` branch are published to the `@canary` tag on npm regularly.

## Dependencies

### JavaScript Dependencies

_You'll need a working node.js environment with pnpm._

- Install or enable [pnpm](https://pnpm.io/installation):

  ```
  corepack enable pnpm

  # or
  npm install -g pnpm@latest
  ```

  `pnpm` [respects the `packageManager` field in `package.json` by
  default](https://pnpm.io/settings#managepackagemanagerversions), even when
  installed without Corepack. This ensures that pnpm behaves the same locally as
  it does in CI.

- _(Optional)_ Install [fnm](https://github.com/Schniz/fnm) or
  [nvm](https://github.com/nvm-sh/nvm). This will ensure you use the same
  version of node as our CI does, via our `.node-version` configuration file.

- _(Optional)_ Install the [GitHub CLI](https://github.com/cli/cli#installation).

### Rust Dependencies

_You can skip these steps if you don't intend to modify any Rust code._

- Install Rust and Cargo via [rustup](https://rustup.rs).

- _(Linux)_ Install a C compiler:

  ```
  sudo apt install build-essential
  ```

- _(macOS)_ Install the Command Line Tools for Xcode package:

  ```
  xcode-select --install
  ```

## Local Development

1. Clone the Next.js repository (using a [blobless clone] for speed):

   ```
   gh repo clone vercel/next.js -- --filter=blob:none --single-branch

   # or, alternatively (via https)
   git clone https://github.com/vercel/next.js.git --filter=blob:none --single-branch

   # or, alternatively (via ssh)
   git clone git@github.com:vercel/next.js.git --filter=blob:none --single-branch
   ```

   [blobless clone]: https://github.blog/open-source/git/get-up-to-speed-with-partial-clone-and-shallow-clone/#user-content-blobless-clones

1. The default branch is `canary`. Create a new branch off of `canary` with:

   ```
   git switch --create MY_BRANCH_NAME
   ```

1. Install the Node.js dependencies with:

   ```
   pnpm install
   ```

1. Start developing and watch for JavaScript code changes using
   [Turborepo](https://turborepo.dev/):

   ```
   pnpm dev  # or use `next build` to build on-demand
   ```

1. If you make Rust changes (e.g. Turbopack), you can build a new napi binding
   with:

   ```
   pnpm swc-build-native

   # or, if you'd like to build in release mode (e.g. for benchmarking)
   pnpm swc-build-native --release

   # or, if you'd like to build both JS and Rust changes at once with Turborepo
   pnpm build-all
   ```

1. In a new terminal, run `pnpm types` to compile declaration files from
   TypeScript.
   _Note: You may need to repeat this step if your types get outdated._

1. When your changes are finished, commit them to the branch:

   ```
   git add .
   git commit -m "DESCRIBE_YOUR_CHANGES_HERE"
   ```

1. To open a pull request you can use the GitHub CLI which automatically forks and sets up a remote branch. Follow the prompts when running:
   ```
   gh pr create
   ```

For instructions on how to build a project with your local version of the CLI,
see **[Developing Using Your Local Version of Next.js](./developing-using-local-app.md)** as linking the package is not sufficient to develop locally.

## Testing a local Next.js version on an application

Since Turbopack doesn't support symlinks when pointing outside of the workspace directory, it can be difficult to develop against a local Next.js version. Neither `pnpm link` nor `file:` imports quite cut it. An alternative is to pack the Next.js version you want to test into a tarball and add it to the pnpm overrides of your test application. The following script will do it for you:

```bash
pnpm pack-next --tar && pnpm unpack-next path/to/project
```

Or without running the build:

```bash
pnpm pack-next --no-js-build --tar && pnpm unpack-next path/to/project
```

Without going through a tarball (only works if you've added the overrides from `pack-next`):

```bash
pnpm patch-next path/to/project
```

Supports the same arguments:

```bash
pnpm patch-next --no-js-build path/to/project
```

### Explanation of the scripts

```bash
# Generate a tarball of the Next.js version you want to test
$ pnpm pack-next --tar

# You can also pass any cargo argument to the script

# To skip the `pnpm i` and `pnpm build` steps in next.js (e. g. if you are running `pnpm dev`)
$ pnpm pack-next --no-js-build
```

Afterwards, you'll need to unpack the tarball into your test project. You can either manually edit the `package.json` to point to the new tarballs (see the stdout from `pack-next` script), or you can automatically unpack it with:

```bash
# Unpack the tarballs generated with pack-next into project's node_modules
$ pnpm unpack-next path/to/project
```

## Developing the Dev Overlay

The dev overlay is a feature of Next.js that allows you to see the internal state of the app including the errors. To learn more about contributing to the dev overlay, see the [Dev Overlay README.md](../../packages/next/src/client/components/react-dev-overlay/README.md).

## `NODE_ENV` vs `__NEXT_DEV_SERVER`

Both `next dev` and `next build --debug-prerender` produce bundles with `NODE_ENV=development`. Use `process.env.__NEXT_DEV_SERVER` to distinguish between them:

- `process.env.NODE_ENV !== 'production'` — code that should exist in dev bundles but be eliminated from prod bundles. This is a build-time check.
- `process.env.__NEXT_DEV_SERVER` — code that should only run with the dev server (`next dev`), not during `next build --debug-prerender` or `next start`.

## Recover disk space

Rust builds quickly add up to a lot of disk space, you can clean up old artifacts with this command:

```bash
pnpm sweep
```

It will also clean up other caches (pnpm store, cargo, etc.) and run `git gc` for you.
