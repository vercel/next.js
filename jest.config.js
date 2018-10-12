'use strict'

module.exports = {
  testMatch: ['**/*.test.js'],
  verbose: true,
  bail: true,
  testEnvironment: 'node',
  rootDir: 'test',
  modulePaths: ['<rootDir>/lib'],
  globalSetup: '<rootDir>/jest-global-setup.js',
  globalTeardown: '<rootDir>/jest-global-teardown.js'
}
