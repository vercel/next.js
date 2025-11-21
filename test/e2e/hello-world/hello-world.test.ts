import { nextTestSetup } from 'e2e-utils'

describe('hello-world', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })

  // Recommended for tests that need a full browser
  it('should work using browser', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')
  })

  // In case you need the full HTML. Can also use $.html() with cheerio.
  it('should work with html', async () => {
    const html = await next.render('/')
    expect(html).toContain('hello world')
  })

  // In case you need to test the response object
  it('should work with fetch', async () => {
    const res = await next.fetch('/')
    const html = await res.text()
    expect(html).toContain('hello world')
  })
})
