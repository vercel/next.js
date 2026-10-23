import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-trailing-slash', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      events: '3.3.0',
    },
    env: {
      // Build dependency tracking must also run with locally built native bindings.
      TURBO_ENGINE_IGNORE_DIRTY: '1',
    },
  })

  it('tracks a loader dependency required with a trailing slash', async () => {
    const $ = await next.render$('/')
    expect($('#message').text()).toBe('hello from the loader')
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#message').text()).toBe(
      'hello from the loader'
    )
  })
})
