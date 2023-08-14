// Tests that are currently enabled with experimental Turbopack in CI.
// Only tests that are actively testing against Turbopack should
// be enabled here
const enabledTests = [
  'test/development/api-cors-with-rewrite/index.test.ts',
  'test/development/middleware-warnings/index.test.ts',
  'test/e2e/app-dir/app-css-pageextensions/index.test.ts',
  'test/e2e/app-dir/app-rendering/rendering.test.ts',
  'test/e2e/app-dir/app-simple-routes/app-simple-routes.test.ts',
  'test/e2e/app-dir/build-size/index.test.ts',
  'test/e2e/app-dir/metadata-missing-metadata-base/index.test.ts',
  'test/e2e/app-dir/next-config/index.test.ts',
  'test/e2e/disable-js-preload/test/index.test.js',
  'test/e2e/dynamic-route-interpolation/index.test.ts',
  'test/e2e/i18n-api-support/index.test.ts',
  'test/e2e/middleware-fetches-with-body/index.test.ts',
  'test/e2e/next-head/index.test.ts',
  'test/e2e/nonce-head-manager/index.test.ts',
  'test/e2e/ssr-react-context/index.test.ts',
  'test/e2e/transpile-packages/index.test.ts',
  'test/e2e/type-module-interop/index.test.ts',
  'test/e2e/undici-fetch/index.test.ts',
  'test/integration/bigint/test/index.test.js',
]

module.exports = { enabledTests }
