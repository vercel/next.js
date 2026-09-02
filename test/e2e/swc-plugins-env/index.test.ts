import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('swc-plugins-env', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should pass correct environment to swc plugins', async () => {
    const $ = await next.render$('/')
    if (isNextDev) {
      expect($('main').text()).toBe('The SWC plugin received env=development')
    } else {
      expect($('main').text()).toBe('The SWC plugin received env=production')
    }
  })
})
