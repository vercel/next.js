module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.js'],
  transform: { '^.+\\.ts$': '<rootDir>/jest-typescript-transform.cjs' },
  clearMocks: true,
}
