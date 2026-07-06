import { runTests } from './utils'

describe('app dir - with output export - trailing slash', () => {
  describe.each([{ trailingSlash: false }, { trailingSlash: true }])(
    "should work in prod with trailingSlash '$trailingSlash'",
    ({ trailingSlash }) => {
      runTests({ trailingSlash })
    }
  )
})
