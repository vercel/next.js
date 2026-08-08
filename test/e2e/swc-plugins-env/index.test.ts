import { nextTestSetup } from 'e2e-utils'

describe('swc-plugins-env', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  it('should pass correct environment to swc plugins', async () => {
    const $ = await next.render$('/')
    if (isNextDev) {
      expect($('main').text()).toBe('The SWC plugin received env=development')
    } else {
      expect($('main').text()).toBe('The SWC plugin received env=production')
    }
  })
})
