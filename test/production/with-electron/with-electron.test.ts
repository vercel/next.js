import { nextTestSetup } from 'e2e-utils'

describe('with-electron', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the home page', async () => {
    const html = await next.render('/')
    expect(html).toContain('This is the home page')
  })

  it('should render the about page', async () => {
    const html = await next.render('/about')
    expect(html).toContain('This is the about page')
  })

  it('should do navigations via Link', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#about-via-link').click()
    const text = await browser.elementByCss('#about-page p').text()
    expect(text).toBe('This is the about page')
  })

  it('should do navigations via Router', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#about-via-router').click()
    const text = await browser.elementByCss('#about-page p').text()
    expect(text).toBe('This is the about page')
  })
})
