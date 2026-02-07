import { nextTestSetup } from 'e2e-utils'

describe('symbolic-file-links', () => {
  const { next } = nextTestSetup({
    files: __dirname,
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
})
