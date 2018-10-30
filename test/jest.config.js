'use strict'

module.exports = {
  displayName: 'webdriver',
  testMatch: ['**/*.test.js'],
  verbose: true,
  bail: true,
  testEnvironment: 'node',
  modulePaths: ['<rootDir>/lib'],
  globalSetup: '<rootDir>/jest-global-setup.js',
  globalTeardown: '<rootDir>/jest-global-teardown.js'
}
