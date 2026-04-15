// BLOCKED: Two test files (index.test.ts, module-imports.test.ts) share a context object
// with File instances. Each describe.each variant writes completely different file content
// and restarts the app per test. The shared test runner pattern with per-test app lifecycle
// cannot be modeled with nextTestSetup().
// Original: test/integration/edge-runtime-module-errors/test/index.test.ts
//           test/integration/edge-runtime-module-errors/test/module-imports.test.ts
it.todo('edge-runtime-module-errors')
