module.exports = {
  // this will become default in jest 27:
  testRunner: 'jest-circus/runner',
  testMatch: ['**/*.test.js'],
  verbose: true,
  rootDir: '',
  modulePaths: ['<rootDir>/test/lib'],
  globalSetup: '<rootDir>/test/jest-global-setup.js',
  globalTeardown: '<rootDir>/test/jest-global-teardown.js',
  setupFilesAfterEnv: ['<rootDir>/test/jest-setup-after-env.js'],
  testEnvironment: '<rootDir>/test/jest-environment.js',
}
