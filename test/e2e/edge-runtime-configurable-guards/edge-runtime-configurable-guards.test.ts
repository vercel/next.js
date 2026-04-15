// BLOCKED: Uses File.write()/File.restore() to write entirely different file contents
// per test case, with per-test app lifecycle (launchApp/killApp in beforeEach/afterEach).
// Also manipulates node_modules/.pnpm paths. The describe.each + per-test server restart
// pattern cannot be modeled with nextTestSetup().
// Original: test/integration/edge-runtime-configurable-guards/test/index.test.ts
it.todo('edge-runtime-configurable-guards')
