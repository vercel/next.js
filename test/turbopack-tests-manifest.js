// Tests that are currently enabled with experimental Turbopack in CI.
// Only tests that are actively testing against Turbopack should
// be enabled here
const enabledTests = [
  'test/development/api-cors-with-rewrite/index.test.ts',
  'test/e2e/app-dir/app-rendering/rendering.test.ts',
  'test/e2e/app-dir/app-simple-routes/app-simple-routes.test.ts',
  'test/integration/bigint/test/index.test.js',
]

module.exports = { enabledTests }
