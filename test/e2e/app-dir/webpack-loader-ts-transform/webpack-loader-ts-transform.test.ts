import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// This test is skipped because it's only expected to run in turbopack, which isn't enabled for builds
// @force-gate !deploy
describe('webpack-loader-ts-transform', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should accept Typescript returned from Webpack loaders', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('something')
  })
})
