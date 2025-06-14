import type { TestRunnerConfig } from '@storybook/test-runner'
import { injectAxe, checkA11y } from 'axe-playwright'

/*
 * See https://storybook.js.org/docs/writing-tests/test-runner#test-hook-api
 * to learn more about the test-runner hooks API.
 */
const config: TestRunnerConfig = {
  async preVisit(page) {
    await injectAxe(page)
  },
  async postVisit(page) {
    await checkA11y(page, 'nextjs-portal', {
      detailedReport: true,
      detailedReportOptions: {
        html: true,
      },
      // Verbose prints additional logs in the terminal on passing tests taking up space
      // that's needed by failed tests.
      verbose: false,
    })
  },
}

export default config
