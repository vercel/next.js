// BLOCKED: Each test writes different content to pages/index.js and then starts a fresh
// dev server or runs a fresh build. This per-test app/build lifecycle (start → render →
// kill per test case) cannot be modeled with a single nextTestSetup() instance.
// Original: test/integration/data-fetching-errors/test/index.test.ts
it.todo('data-fetching-errors')
