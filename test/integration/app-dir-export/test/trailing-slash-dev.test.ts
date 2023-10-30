import { runTests } from './utils'

describe('app dir - with output export - trailing slash dev', () => {
  describe('development mode', () => {
    it.each([{ trailingSlash: false }, { trailingSlash: true }])(
      "should work in dev with trailingSlash '$trailingSlash'",
      async ({ trailingSlash }) => {
        await runTests({ isDev: true, trailingSlash })
      }
    )
  })
})
