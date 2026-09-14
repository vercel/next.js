const nextJest = require('next/jest')
const { withGateTransformer } = require('./test/lib/gate/jest-transformer')

const createJestConfig = nextJest()

// Any custom config you want to pass to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  displayName: process.env.IS_WEBPACK_TEST ? 'webpack' : 'Turbopack',
  testMatch: ['**/*.test.js', '**/*.test.ts', '**/*.test.jsx', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest-setup-after-env.ts'],
  verbose: true,
  rootDir: 'test',
  roots: [
    '<rootDir>',
    '<rootDir>/../packages/next/src/',
    '<rootDir>/../packages/next-codemod/',
    '<rootDir>/../packages/eslint-plugin-internal/',
    '<rootDir>/../packages/font/src/',
    '<rootDir>/../packages/next-routing/',
  ],
  haste: {
    // Throwing to avoid warnings creeping up over time polluting log output.
    throwOnModuleCollision: true,
  },
  modulePathIgnorePatterns: [
    '/\\.next/',
    // Prevents jest-haste-map warnings due to multiple versions of the same
    // package being vendored. Also means tests in `compiled` will be ignored.
    // Jest does not normalize/resolve paths in modulePathIgnorePatterns so we can't
    // prefix with <rootDir>/../ like we do in roots.
    'packages/next/src/compiled/',
    '<rootDir>/development/app-dir/non-context-aware-addon/bindings',
    '<rootDir>/development/app-dir/non-context-aware-addon/single-context-addon',
    '<rootDir>/development/app-dir/ssr-in-rsc/internal-pkg/',
    '<rootDir>/e2e/app-dir/self-importing-package/internal-pkg',
    '<rootDir>/e2e/app-dir/self-importing-package-monorepo/internal-pkg',
    '<rootDir>/e2e/app-dir/server-source-maps/fixtures/default/internal-pkg',
    '<rootDir>/e2e/app-dir/turbopack-reports/bindings',
    '<rootDir>/e2e/app-dir/turbopack-reports/native-addon',
    '<rootDir>/e2e/prerender-native-module/bindings',
    '<rootDir>/e2e/prerender-native-module/native-addon',
    '<rootDir>/e2e/prerender-native-module/native-addon-wrapper',
    '<rootDir>/e2e/transpile-packages-typescript-foreign/pkg',
    '<rootDir>/production/prerender-worker-threads/bindings',
    '<rootDir>/production/prerender-worker-threads/single-context-addon',
    '<rootDir>/production/standalone-mode/tracing-side-effects-false/foo',
    '<rootDir>/production/standalone-mode/tracing-static-files/foo',
    '<rootDir>/production/standalone-mode/tracing-unparsable/foo',
    '<rootDir>/production/supports-module-resolution-nodenext/pkg',
  ],
  modulePaths: ['<rootDir>/lib'],
  transformIgnorePatterns: ['/next[/\\\\]dist/', '/\\.next/'],
  moduleNameMapper: {
    '@next/font/(.*)': '@next/font/$1',
  },
}

// Check if the environment variable is set to enable test report,
// Insert a reporter to generate a junit report to upload.
//
// This won't count retries to avoid tests being reported twice.
// Our test report will report test results for flaky tests as failed without retry.
const enableTestReport = !!process.env.NEXT_JUNIT_TEST_REPORT

if (enableTestReport) {
  if (!customJestConfig.reporters) {
    customJestConfig.reporters = ['default']
  }

  let outputDirectory
  if (process.env.IS_TURBOPACK_TEST) {
    outputDirectory = '<rootDir>/turbopack-test-junit-report'
  } else if (process.env.NEXT_RSPACK) {
    outputDirectory = '<rootDir>/rspack-test-junit-report'
  } else {
    outputDirectory = '<rootDir>/test-junit-report'
  }

  customJestConfig.reporters.push([
    'jest-junit',
    {
      outputDirectory,
      reportTestSuiteErrors: 'true',
      uniqueOutputName: 'true',
      outputName: 'nextjs-test-junit',
      addFileAttribute: 'true',
    },
  ])
}

// createJestConfig is exported in this way to ensure that next/jest can load the Next.js config which is async
const createConfig = createJestConfig(customJestConfig)

module.exports = async function createConfigWithGates() {
  // `withGateTransformer` chains the `@gate` pragma rewrite in front of the
  // SWC transformer that `next/jest` configured, keeping next/jest's SWC
  // options as the single source of truth. See test/lib/gate/.
  return withGateTransformer(await createConfig())
}
