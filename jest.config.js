const nextJest = require('next/jest')

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
  ],
  modulePathIgnorePatterns: ['/\\.next/'],
  modulePaths: ['<rootDir>/lib'],
  transformIgnorePatterns: ['/next[/\\\\]dist/', '/\\.next/'],
  moduleNameMapper: {
    '@next/font/(.*)': '@next/font/$1',
  },
  // Coverage configuration
  collectCoverage: !!process.env.COVERAGE,
  collectCoverageFrom: [
    '<rootDir>/../packages/next/src/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/../packages/font/src/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/../packages/next-codemod/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/../packages/create-next-app/**/*.{js,jsx,ts,tsx}',
    // Exclude compiled/vendored dependencies
    '!<rootDir>/../packages/next/src/compiled/**',
    '!<rootDir>/../packages/next/src/bundles/**',
    // Exclude build output
    '!<rootDir>/../**/dist/**',
    '!<rootDir>/../**/.next/**',
    '!<rootDir>/../**/node_modules/**',
    // Exclude test files
    '!<rootDir>/../**/*.test.{js,jsx,ts,tsx}',
    '!<rootDir>/../**/__tests__/**',
  ],
  coverageDirectory: '<rootDir>/../coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThresholds: {
    global: {
      statements: 50,
      branches: 45,
      functions: 50,
      lines: 50,
    },
    // Critical modules with higher thresholds
    './packages/next/src/cli/**/*.{js,ts}': {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
    './packages/next/src/api/**/*.{js,ts}': {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
    './packages/next/src/export/**/*.{js,ts}': {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
    // Shared library utilities
    './packages/next/src/shared/lib/**/*.{js,ts}': {
      statements: 60,
      branches: 55,
      functions: 60,
      lines: 60,
    },
    './packages/next/src/shared/lib/router/utils/**/*.{js,ts}': {
      statements: 70,
      branches: 65,
      functions: 70,
      lines: 70,
    },
    // Server modules
    './packages/next/src/server/config*.{js,ts}': {
      statements: 50,
      branches: 45,
      functions: 50,
      lines: 50,
    },
    // Build utilities
    './packages/next/src/build/utils.{js,ts}': {
      statements: 50,
      branches: 45,
      functions: 50,
      lines: 50,
    },
    // Lib helpers
    './packages/next/src/lib/helpers/**/*.{js,ts}': {
      statements: 60,
      branches: 55,
      functions: 60,
      lines: 60,
    },
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
