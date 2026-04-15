import { nextTestSetup } from 'e2e-utils'

describe('basepath root catch-all', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should use correct data URL for root catch-all', async () => {
    const browser = await next.browser('/docs/hello')
    await browser.elementByCss('#root-catchall-link').click()
    await browser.waitForElementByCss('#url')

    const dataUrl = await browser.elementByCss('#url').text()
    const { pathname } = new URL(dataUrl, await browser.url())
    expect(pathname).toBe(`/_next/data/${next.buildId}/root/catch-all.json`)
  })
})
