import { nextTestSetup } from 'e2e-utils'

describe('Static Page Name', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page via SSR correctly', async () => {
    const html = await next.render('/static')
    expect(html).toMatch(/hello from static page/)
  })

  it('should navigate to static page name correctly', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#to-static').click()
    await browser.waitForElementByCss('#static')
    const html = await browser.eval(`document.documentElement.innerHTML`)
    expect(html).toMatch(/hello from static page/)
  })
})
