import { runTests } from './utils'

it.each([{ trailingSlash: false }, { trailingSlash: true }])(
  "should work in dev with trailingSlash '$trailingSlash'",
  async ({ trailingSlash }) => {
    await runTests({ isDev: true, trailingSlash })
  }
)
