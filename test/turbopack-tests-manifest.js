// Tests that are currently enabled with experimental Turbopack in CI.
// Only tests that are actively testing against Turbopack should
// be enabled here
const enabledTests = [
  'test/development/api-cors-with-rewrite/index.test.ts',
  'test/integration/bigint/test/index.test.js',
]

module.exports = { enabledTests }
