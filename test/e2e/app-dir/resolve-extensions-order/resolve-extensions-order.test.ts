import { nextTestSetup } from 'e2e-utils'

describe('resolve-extensions-order', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // When resolveExtensions lists .web.js before .js, the .web.js variant
  // should be resolved for extensionless imports. This matches webpack behavior.
  // See: https://github.com/vercel/next.js/issues/91117

  it('should resolve .web.js over .js on the server based on resolveExtensions order', async () => {
    const res = await next.fetch('/')
    const html = await res.text()
    expect(html).toContain('hello from web')
    expect(html).not.toContain('hello from default')
  })

  it('should resolve .web.js over .js on the client based on resolveExtensions order', async () => {
    const browser = await next.browser('/')
    const serverText = await browser.elementByCss('#server').text()
    expect(serverText).toBe('hello from web')

    const clientText = await browser.elementByCss('#client').text()
    expect(clientText).toBe('client hello from web')
  })
})
