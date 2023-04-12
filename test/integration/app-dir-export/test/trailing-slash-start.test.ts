import { runTests } from './utils'

it.each([{ trailingSlash: false }, { trailingSlash: true }])(
  "should work in prod with trailingSlash '$trailingSlash'",
  async ({ trailingSlash }) => {
    await runTests({ isDev: false, trailingSlash })
  }
)
