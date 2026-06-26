const createJestDefaultConfig = require('./jest.config.js')

module.exports = async function createConfig() {
  const jestDefaultConfig = await createJestDefaultConfig()
  /** @type {import('jest').Config} */
  const customConfig = {
    ...jestDefaultConfig,
    displayName: 'Turbopack',
    setupFiles: [
      ...(jestDefaultConfig.setupFiles ?? []),
      '<rootDir>/jest-setup-files.turbopack.js',
    ],
  }

  return customConfig
}
