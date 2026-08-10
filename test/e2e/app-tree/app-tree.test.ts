import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('AppTree', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should provide router context in AppTree on SSR', async () => {
    let html = await next.render('/')
    expect(html).toMatch(/page:.*?\//)

    html = await next.render('/another')
    expect(html).toMatch(/page:.*?\/another/)
  })

  it('should provide router context in AppTree on CSR', async () => {
    const browser = await next.browser('/')
    let html = await browser.eval(`document.documentElement.innerHTML`)
    expect(html).toMatch(/page:.*?\//)

    await browser.elementByCss('#another').click()
    await retry(async () => {
      html = await browser.eval(`document.documentElement.innerHTML`)
      expect(html).toMatch(/page:.*?\//)
    })

    await browser.elementByCss('#home').click()
    await retry(async () => {
      html = await browser.eval(`document.documentElement.innerHTML`)
      expect(html).toMatch(/page:.*?\/another/)
    })
  })

  it('should pass AppTree to NextPageContext', async () => {
    const html = await next.render('/hello')
    expect(html).toMatch(/saved:.*?Hello world/)
  })
})
