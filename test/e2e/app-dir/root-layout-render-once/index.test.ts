import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app-dir root layout render once', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should only render root layout once', async () => {
    let $ = await next.render$('/render-once')
    expect($('#counter').text()).toBe('0')
    $ = await next.render$('/render-once')
    expect($('#counter').text()).toBe('1')
    $ = await next.render$('/render-once')
    expect($('#counter').text()).toBe('2')
  })
})
