import { nextTestSetup } from 'e2e-utils'

describe('app-dir root layout render once', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
    // No deploy-specific incompatibility is documented.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should only render root layout once', async () => {
    let $ = await next.render$('/render-once')
    expect($('#counter').text()).toBe('0')
    $ = await next.render$('/render-once')
    expect($('#counter').text()).toBe('1')
    $ = await next.render$('/render-once')
    expect($('#counter').text()).toBe('2')
  })
})
