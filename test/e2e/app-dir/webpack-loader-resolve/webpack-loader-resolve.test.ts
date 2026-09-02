import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// This test is skipped because it's only expected to run in turbopack, which isn't enabled for builds
// @force-gate !deploy
describe('webpack-loader-resolve', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support resolving absolute path via loader getResolve', async () => {
    const $ = await next.render$('/')
    expect($('#absolute').text()).toBe('abc')
    expect($('#relative').text()).toBe('xyz')
  })
})
