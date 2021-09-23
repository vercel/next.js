# Writing tests for Next.js

## Test types in Next.js

- e2e: These tests will run against `next dev` and `next start`
- development: These tests only run against `next dev`
- production: These tests will run against `next start`.
- integration: These tests run misc checks and modes and is where tests used to be added before we added more specific folders. We **should not** add any more tests here.
- unit: These are very fast tests that should run without a browser or running next and should be testing a specific utility.

For the e2e, production, and development tests the `createNext` utility should be used and an example is available [here](./e2e/example.test.txt). This creates an isolated Next.js install to ensure nothing in the monorepo is relied on accidentally causing incorrect tests.

All new tests should be written in TypeScript either `.ts` (or `.tsx` for unit tests). This will help ensure we catch smaller issues in tests that could cause flakey or incorrect tests.

## Best practices

- When checking for a condition that might take time, ensure it is waited for either using the browser `waitForElement` or using the `check` util in `next-test-utils`.
- When applying a fix, ensure the test fails without the fix. This makes sure the test will properly catch regressions.
