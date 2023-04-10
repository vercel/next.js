import { runTests } from './utils'

it.each([
  { isDev: true, trailingSlash: false },
  { isDev: true, trailingSlash: true },
  { isDev: false, trailingSlash: false },
  { isDev: false, trailingSlash: true },
])(
  "should work with isDev '$isDev' and trailingSlash '$trailingSlash'",
  async ({ isDev, trailingSlash }) => {
    await runTests({ isDev, trailingSlash })
  }
)
