import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('non-ascii-page-name', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render a static page with non-ASCII name via encoded URL', async () => {
    const $ = await next.render$('/%D1%82%D0%B5%D1%81%D1%82')
    expect($('p').text()).toBe('non-ascii static page')
  })

  it('should render a dynamic route with non-ASCII static segment', async () => {
    const $ = await next.render$('/%D0%B1%D0%BB%D0%BE%D0%B3/hello')
    expect($('p').text()).toBe('blog post: hello')
  })

  it('should client-side navigate to a non-ASCII page', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('home')

    await browser.elementByCss('#link-to-test').click()
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(
        'non-ascii static page'
      )
    })
  })

  it('should client-side navigate to a dynamic route with non-ASCII segment', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('home')

    await browser.elementByCss('#link-to-blog').click()
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('blog post: hello')
    })
  })
})
