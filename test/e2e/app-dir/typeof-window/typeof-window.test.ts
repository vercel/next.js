import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// This test is skipped when deployed because the local tarball appears corrupted
// It also doesn't seem particularly useful to test when deployed
// @force-gate !deploy
describe('typeof-window', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'my-differentiated-files': 'file:./my-differentiated-files.tar',
    },
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('Page loaded')
  })
})
