import { runTests } from './utils'

// These cases patch fixture files and manually run local builds.
// @force-gate !deploy
describe('app dir - with output export - trailing slash', () => {
  describe.each([{ trailingSlash: false }, { trailingSlash: true }])(
    "should work in prod with trailingSlash '$trailingSlash'",
    ({ trailingSlash }) => {
      runTests({ trailingSlash })
    }
  )
})
