# Testing

## Running tests

Before you start to run tests, you need to build project first:

```bash
pnpm build
```

And for more detail about building, you can check out [building.md](./building.md)

We recommend running the tests in headless mode (with the browser windows hidden) and with a specific directory pattern and/or test name (`-t`) which ensures only a small part of the test suite is run locally:

For example, running one test in the production test suite:

Running one test in the `test/integration/production` test suite:

```sh
pnpm testheadless test/integration/production/ -t "should allow etag header support"
```

Running all tests in the `test/integration/production` test suite:

```sh
pnpm testheadless test/integration/production/
```

When you want to debug a particular test you can replace `pnpm testheadless` with `pnpm testonly` to opt out of the headless browser.
When the test runs it will open the browser that is in the background by default, allowing you to inspect what is on the screen.

```sh
pnpm testonly test/integration/production/ -t "should allow etag header support"
```

**End-to-end (e2e)** tests are run in complete isolation from the repository.
When you run an e2e test, a local version of next will be created inside your system's temp folder (eg. /tmp),
which is then linked to the app, also created inside a temp folder. A server is started on a random port, against which the tests will run.
After all tests have finished, the server is destroyed and all remaining files are deleted from the temp folder.

## Writing tests for Next.js

### Getting Started

You can set up a new test using `pnpm new-test` which will start from a template related to the test type.

### Test Types in Next.js

- e2e: Runs against `next dev`, `next start`, and deployed to Vercel.
- development: Runs against `next dev`.
- production: Runs against `next start`.
- integration: Historical location of tests. Runs misc checks and modes. Ideally, we don't add new test suites here anymore as these tests are not isolated from the monorepo.
- unit: Very fast tests that should run without a browser or run `next` and should be testing a specific utility.

For the e2e, development, and production tests the `createNext` utility should be used and an example is available [here](../../test/e2e/example.txt). This creates an isolated Next.js install to ensure nothing in the monorepo is relied on accidentally causing incorrect tests.

All new test suites should be written in TypeScript either `.ts` (or `.tsx` for unit tests). This will help ensure we catch smaller issues in tests that could cause flakey or incorrect tests.

If a test suite already exists that relates closely to the item being tested (e.g. hash navigation relates to existing navigation test suites) the new checks can be added to the existing test suite.

### Best Practices

- When checking for a condition that might take time, ensure it is waited for either using the browser `waitForElement` or using the `check` util in `next-test-utils`.
- When applying a fix, ensure the test fails without the fix. This makes sure the test will properly catch regressions.

### Helpful environment variables

Some test-specific environment variables can be used to help debug isolated tests better, these can be leveraged by prefixing the `pnpm test` command.

- When investigating failures in isolated tests you can use `NEXT_TEST_SKIP_CLEANUP=1` to prevent deleting the temp folder created for the test, then you can run `pnpm next` while inside of the temp folder to debug the fully set-up test project.
- You can also use `NEXT_SKIP_ISOLATE=1` if the test doesn't need to be installed to debug and it will run inside of the Next.js repo instead of the temp directory, this can also reduce test times locally but is not compatible with all tests.
- The `NEXT_TEST_MODE` env variable allows toggling specific test modes for the `e2e` folder, it can be used when not using `pnpm test-dev` or `pnpm test-start` directly. Valid test modes can be seen here: https://github.com/vercel/next.js/blob/aa664868c102ddc5adc618415162d124503ad12e/test/lib/e2e-utils.ts#L46
- You can use `NEXT_TEST_PREFER_OFFLINE=1` while testing to configure the package manager to include the [`--prefer-offline`](https://pnpm.io/cli/install#--prefer-offline) argument during test setup. This is helpful when running tests in internet restricted environments such as planes or public wifi.

### Debugging

When tests are run in CI and a test failure occurs we attempt to capture traces of the playwright run to make debugging the failure easier. A test-trace artifact should be uploaded after the workflow completes which can be downloaded, unzipped, and then inspected with `pnpm playwright show-trace ./path/to/trace`

### Profiling tests

Add `NEXT_TEST_TRACE=1` to enable test profiling. It's useful for improving our testing infrastructure.
