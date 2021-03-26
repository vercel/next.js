module.exports = {
  testMatch: ['**/*.test.js'],
  verbose: true,
  rootDir: 'test',
  modulePaths: ['<rootDir>/lib'],
  globalSetup: '<rootDir>/jest-global-setup.js',
  globalTeardown: '<rootDir>/jest-global-teardown.js',
  setupFilesAfterEnv: ['<rootDir>/jest-setup-after-env.js'],
  testEnvironment: '<rootDir>/jest-environment.js',
}
