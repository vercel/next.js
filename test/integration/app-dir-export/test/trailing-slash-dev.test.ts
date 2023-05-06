import { runTests } from './utils'

describe.skip('trailing slash dev', () => {
  it.each([{ trailingSlash: false }, { trailingSlash: true }])(
    "should work in dev with trailingSlash '$trailingSlash'",
    async ({ trailingSlash }) => {
      await runTests({ isDev: true, trailingSlash })
    }
  )
})
