'use strict'

module.exports = {
  testMatch: ['**/*.test.js'],
  verbose: true,
  bail: true,
  testEnvironment: 'node',
  modulePaths: ['<rootDir>/test/lib'],
  globalSetup: '<rootDir>/test/jest-global-setup.js',
  globalTeardown: '<rootDir>/test/jest-global-teardown.js',
  coverageReporters: ['text', 'lcov', 'cobertura']
}
