# Testing

## Running tests

Before you start to run tests, you need to [build the project first](./building.md):

```bash
pnpm build
```

We recommend running the tests in a specific directory pattern.

For example, running one test in the production test suite:

Running tests in the `test/e2e/app-dir/app` test suite in production mode (`next build` and `next start`):

```sh
pnpm test-start test/e2e/app-dir/app/
```

Running tests in the `test/e2e/app-dir/app` test suite in development mode (`next dev`):

```sh
pnpm test-dev test/e2e/app-dir/app/
```

When the test runs, it will open the browser in the background by default, you won't see the browser window.

When you want to debug a particular test you can replace
`pnpm test-start` with `pnpm testonly-start` to see the browser window open.

```sh
pnpm testonly-start test/e2e/app-dir/app/
```

**End-to-end (e2e)** tests are run in complete isolation from the repository.
When you run an `test/e2e`, `test/production`, or `test/development` tests,
a local version of Next.js will be created inside your system's temp folder (e.g. /tmp),
which is then linked to an isolated version of the application.
A server is started on a random port, against which the tests will run.
After all tests have finished, the server is destroyed and all remaining files are deleted from the temp folder.
All of this logic is handled by `nextTestSetup` automatically.

## Writing tests for Next.js

### Getting Started

You can set up a new test using `pnpm new-test` which will start from a template related to the test type.

### Test Types in Next.js

- e2e: Runs against `next dev`, `next start`, and deployed to Vercel.
- development: Runs against `next dev`.
- production: Runs against `next start`.
- integration: Historical location of tests.
  Runs misc checks and modes.
  Ideally, we don't add new test suites here anymore as these tests are not isolated from the monorepo.
- unit: Very fast tests that should run without a browser or run `next` and should be testing a specific utility.

For the e2e, development, and production tests the `nextTestSetup` utility should be used.
An example is available [here](../../test/e2e/example.txt).
This creates an isolated Next.js installation
to ensure nothing in the monorepo is relied on accidentally causing incorrect tests.
`pnpm new-test` automatically uses `nextTestSetup`

All new test suites should be written in TypeScript either `.ts` (or `.tsx` for unit tests).
This will help ensure we catch smaller issues in tests that could cause flaky or incorrect tests.

If a test suite already exists that relates closely to the item being tested
(e.g., hash navigation relates to existing navigation test suites),
the new checks can be added to the existing test suite.

### Best Practices

- When checking for a condition that might take time,
  ensure it is waited for either using the browser `waitForElement` or using the `check` util in `next-test-utils`.
- When applying a fix, ensure the test fails without the fix.
  This makes sure the test will properly catch regressions.

### Helpful environment variables

Some test-specific environment variables can be used to help debug isolated tests better,
these can be leveraged by prefixing the `pnpm test` command.

- When investigating failures in isolated tests you can use
  `NEXT_TEST_SKIP_CLEANUP=1` to prevent deleting the temp folder created for the test,
  then you can run `pnpm debug` while inside the temp folder to debug the fully set-up test project.
- You can also use `NEXT_SKIP_ISOLATE=1` if the test doesn't need to be installed to debug,
  and it will run inside the Next.js repo instead of the temp directory,
  this can also reduce test times locally but is not compatible with all tests.
- The `NEXT_TEST_MODE` env variable allows toggling specific test modes for the `e2e` folder,
  it can be used when not using `pnpm test-dev` or `pnpm test-start` directly.
  Valid test modes can be seen here:
  https://github.com/vercel/next.js/blob/aa664868c102ddc5adc618415162d124503ad12e/test/lib/e2e-utils.ts#L46
- You can use `NEXT_TEST_PREFER_OFFLINE=1` while testing to configure the package manager to include the
  [`--prefer-offline`](https://pnpm.io/cli/install#--prefer-offline) argument during test setup.
  This is helpful when running tests in internet-restricted environments such as planes or public Wi-Fi.

### Debugging

When tests are run in CI and a test failure occurs,
we attempt to capture traces of the playwright run to make debugging the failure easier.
A test-trace artifact should be uploaded after the workflow completes which can be downloaded, unzipped,
and then inspected with `pnpm playwright show-trace ./path/to/trace`

### Profiling tests

Add `NEXT_TEST_TRACE=1` to enable test profiling. It's useful for improving our testing infrastructure.

### Testing Turbopack

To run the test suite using Turbopack, you can use the `-turbo` version of the npm script:

```sh
pnpm test-dev-turbo test/e2e/app-dir/app/
```

If you want to run a test again both Turbopack and Webpack, use Jest's `--projects` flag:

```sh
pnpm test-dev test/e2e/app-dir/app/ --projects jest.config.*
```

## Integration testing outside the repository with local builds

You can locally generate builds for each package in this repository with:

```bash
pnpm pack-next
```

You can automatically apply modifications to `package.json` by specifying your project directory:

```bash
pnpm pack-next --project ~/shadcn-ui/apps/www/
```

This will find and modify parent workspaces when relevant. These automatic overrides should work
with `npm` and `pnpm`. There are known issues preventing it from working with `bun` and `yarn`.

Flags can be passed to `napi`'s CLI, separated by an argument separator (`--`). For example:

```bash
pnpm pack-next --project ~/my-project/ -- --release
```

See `pnpm pack-next --help` for more details.

### Locally creating tarballs

You can create tarballs with:

```bash
pnpm pack-next --tar
```

The tarballs will be written to a `tarballs` directory in the root of the repository, and you will
be shown information about how to use these tarballs in a project by modifying the workspace
`package.json` file.

On Linux, this generates stripped `@next/swc` binaries to avoid exceeding 2 GiB, [which is
known to cause problems with `pnpm`](https://github.com/libuv/libuv/pull/1501). That behavior can be
overridden with `--compress objcopy-zstd` on Linux (which is slower, but retains debuginfo).

These tarballs can be extracted directly into a project's `node_modules` directory (bypassing the
package manager) by using:

```bash
pnpm unpack-next ~/shadcn-ui
```

However, this is not typically recommended, as installing using the package manager is safer.

## Integration testing outside the repository with preview builds

Every branch build will create a tarball for each package in this repository<sup>1</sup> that can be used in external repositories.

You can use this preview build in other packages by using a https://vercel-packages.vercel.app URL instead of a version in the `package.json`.
Dependencies are automatically rewritten to use the same commit SHA as the package you are using.
For example, if you install `next` from commit `abc`, `next` will have a dependency on `@next/env` at commit `abc` **and** use `next-swc` from commit `abc` as well.

To use `next` from a specific commit (full SHA required):

```json
{
  "dependencies": {
    "next": "https://vercel-packages.vercel.app/next/commits/188f76947389a27e9bcff8ebf9079433679256a7/next"
  }
}
```

or, to use `next` from a specific Pull Request (PR number required):

```json
{
  "dependencies": {
    "next": "https://vercel-packages.vercel.app/next/prs/66445/next"
  }
}
```

<sup>1</sup> Not all native packages are built automatically.
`build-and-deploy` excludes slow, rarely used native variants of `next-swc`.
To force a build of all packages, you can [trigger `build-and-deploy` manually](https://github.com/vercel/next.js/actions/workflows/build_and_deploy.yml) (i.e. `workflow_dispatch`).
