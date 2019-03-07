'use strict'

module.exports = {
  bail: true,
  verbose: true,
  rootDir: 'test',
  preset: 'jest-puppeteer',
  testMatch: ['**/*.test.js'],
  modulePaths: ['<rootDir>/lib'],
  setupTestFrameworkScriptFile: '<rootDir>/jest-test-setup.js'
}
