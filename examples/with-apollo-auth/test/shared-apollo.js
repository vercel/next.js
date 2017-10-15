const clearRequire = require('clear-require')
const glob = require('glob')
const test = require('ava')

/**
 * Motivations:
 *
 * - Client-side getInitialProps() wont have access to the apollo client for
 *   that page (because it's not shared across page bundles), so wont be able to
 *   reset the state, leaving all the logged in user data there :(
 * - So, we have to have a shared module. BUT; next's code splitting means the
 *   bundle for each page will include its own copy of the module, _unless it's
 *   inlcuded in every page_.
 *   - https://github.com/zeit/next.js/issues/659#issuecomment-271824223
 *   - https://github.com/zeit/next.js/issues/1635#issuecomment-292236785
 * - Therefore, this test ensures that every page includes that module, and
 *   hence it will be shared across every page, giving us a global store in
 *   Apollo that we can clear, etc
 */

const apolloFilePath = require.resolve('../lib/init-apollo')

test.beforeEach(() => {
  // Clean up the cache
  clearRequire.all()
})

glob.sync('./pages/**/*.js').forEach((file) => {
  test(`.${file} imports shared apollo module`, (t) => {
    t.falsy(require.cache[apolloFilePath])

    try {
      require(`.${file}`)
    } catch (error) {
      // Don't really care if it fails to execute, etc, just want to be
      // certain the expected require call was made
    }

    t.truthy(require.cache[apolloFilePath])
  })
})
