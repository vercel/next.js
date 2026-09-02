import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('webpack-loader-fs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should allow reading the input FS', async () => {
    const $ = await next.render$('/')
    expect($('#test').text()).toBe(
      "Buffer read: 18, string read: 'this is some data', binary read: 6765, glob read: 'one.txt'"
    )
  })
})
