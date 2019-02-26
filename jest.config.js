'use strict'

module.exports = {
  bail: true,
  verbose: true,
  rootDir: 'test',
  preset: 'jest-puppeteer',
  testMatch: ['**/*.test.js'],
  modulePaths: ['<rootDir>/lib'],
  coverageReporters: ['text', 'lcov', 'cobertura'],
  setupTestFrameworkScriptFile: '<rootDir>/jest-test-setup.js'
}
