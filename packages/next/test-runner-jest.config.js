// eslint-disable-next-line import/no-extraneous-dependencies
const { getJestConfig } = require('@storybook/test-runner')

// The default Jest configuration comes from @storybook/test-runner
const testRunnerConfig = getJestConfig()

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...testRunnerConfig,
  /** Add your own overrides below, and make sure
   *  to merge testRunnerConfig properties with your own
   * @see https://jestjs.io/docs/configuration
   */
  rootDir: '<rootDir>/../src/next-devtools/dev-overlay/',
  testMatch: ['**/*.stories.tsx', '**/*.test.tsx'],
}
