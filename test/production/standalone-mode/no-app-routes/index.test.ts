import { nextTestSetup } from 'e2e-utils'

describe('standalone mode - no app routes', () => {
  const { next } = nextTestSetup({
    // Webpack and Rspack standalone tracing do not support the global virtual store.
    pnpmGlobalVirtualStore: !!process.env.IS_TURBOPACK_TEST,
    files: __dirname,
  })

  it('should handle pages rendering correctly', async () => {
    const browser = await next.browser('/hello')
    expect(await browser.elementByCss('#index').text()).toBe('index-page')
  })
})
