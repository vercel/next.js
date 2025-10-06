const nextJest = require('next/jest')

const createJestConfig = nextJest()

// Any custom config you want to pass to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  displayName: process.env.TURBOPACK ? 'turbopack' : 'default',
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
  ],
  modulePathIgnorePatterns: ['/\\.next/'],
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
module.exports = createJestConfig(customJestConfig)
