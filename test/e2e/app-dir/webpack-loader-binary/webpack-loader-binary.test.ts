import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('webpack-loader-ts-transform', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should allow passing binary assets to and from a Webpack loader', async () => {
    const $ = await next.render$('/')
    expect($('#text').text()).toBe('Got a buffer of 18 bytes')
    expect($('#binary').text()).toBe('Got a buffer of 6765 bytes')
  })
})
