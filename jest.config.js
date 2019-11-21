module.exports = {
  testMatch: ['**/*.test.js'],
  verbose: true,
  bail: true,
  rootDir: 'test',
  modulePaths: ['<rootDir>/lib'],
  globalSetup: '<rootDir>/jest-global-setup.js',
  globalTeardown: '<rootDir>/jest-global-teardown.js',
  testEnvironment: '<rootDir>/jest-environment.js',
}
