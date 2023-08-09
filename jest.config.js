const nextJest = require('next/jest')

const createJestConfig = nextJest()

// Any custom config you want to pass to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  testMatch: ['**/*.test.js', '**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest-setup-after-env.ts'],
  verbose: true,
  rootDir: 'test',
  roots: [
    '<rootDir>',
    '<rootDir>/../packages/next/src/',
    '<rootDir>/../packages/font/src/',
  ],
  modulePathIgnorePatterns: ['/\\.next/'],
  modulePaths: ['<rootDir>/lib'],
  transformIgnorePatterns: ['/next[/\\\\]dist/', '/\\.next/'],
  globals: {
    AbortSignal: global.AbortSignal,
  },
  moduleNameMapper: {
    '@next/font/(.*)': '@next/font/$1',
  },
}

// Check if the environment variable is set to enable test trace,
// Insert a reporter to generate a junit report to upload.
// This won't count for the retry to avoid duplicated test being reported twice
// - which means our test trace will report test results for the flaky test as failed without retry.
const shouldEnableTestTrace =
  process.env.DATADOG_API_KEY &&
  process.env.DATADOG_TRACE_NEXTJS_TEST &&
  !process.env.IS_RETRY

if (shouldEnableTestTrace) {
  if (!customJestConfig.reporters) {
    customJestConfig.reporters = ['default']
  }

  const outputDirectory =
    process.env.TURBOPACK || process.env.EXPERIMENTAL_TURBOPACK
      ? '<rootDir>/turbopack-test-junit-report'
      : '<rootDir>/test-junit-report'

  customJestConfig.reporters.push([
    'jest-junit',
    {
      outputDirectory,
      // note: {filename} is not a full path, since putting full path
      // makes suite name too long and truncates and not able to read the suite name
      suiteNameTemplate: `{title} [${process.env.NEXT_TEST_MODE ?? 'default'}${
        process.env.TURBOPACK ? '/t' : ''
      }${process.env.EXPERIMENTAL_TURBOPACK ? '/et' : ''}/{filename}]`,
      reportTestSuiteErrors: 'true',
      uniqueOutputName: 'true',
      outputName: 'nextjs-test-junit',
    },
  ])
}

// createJestConfig is exported in this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
