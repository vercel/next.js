import { runTests } from './utils'

describe.skip('trailing slash dev', () => {
  it.each([{ trailingSlash: false }, { trailingSlash: true }])(
    "should work in prod with trailingSlash '$trailingSlash'",
    async ({ trailingSlash }) => {
      await runTests({ isDev: false, trailingSlash })
    }
  )
})
