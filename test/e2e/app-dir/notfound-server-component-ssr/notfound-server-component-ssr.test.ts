import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('notfound-server-component-ssr', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('server-renders the not-found page when notFound() is called in a Server Component', async () => {
    const res = await next.fetch('/product/999')
    expect(res.status).toBe(404)

    const $ = cheerio.load(await res.text())

    // The not-found UI is present in the server response, not only added
    // after the client hydrates.
    expect($('#not-found-ui').text()).toBe('This page could not be found.')

    // The root layout is rendered around it (this is what carries `lang`,
    // stylesheets, etc.).
    expect($('html').attr('lang')).toBe('en')
    expect($('#root-layout-header').text()).toBe('root layout')

    // The page's own content must not be server-rendered.
    expect($('#product').length).toBe(0)
  })

  it('server-renders the not-found page for an unmatched URL as well', async () => {
    const res = await next.fetch('/does-not-exist')
    expect(res.status).toBe(404)

    const $ = cheerio.load(await res.text())
    expect($('#not-found-ui').text()).toBe('This page could not be found.')
    expect($('html').attr('lang')).toBe('en')
  })

  it('still renders the matched Server Component when notFound() is not called', async () => {
    const res = await next.fetch('/product/1')
    expect(res.status).toBe(200)

    const $ = cheerio.load(await res.text())
    expect($('#product').text()).toBe('product 1')
    expect($('#not-found-ui').length).toBe(0)
  })

  it('shows the not-found page in the browser', async () => {
    const browser = await next.browser('/product/999')
    expect(await browser.elementByCss('#not-found-ui').text()).toBe(
      'This page could not be found.'
    )
    expect(await browser.elementByCss('#root-layout-header').text()).toBe(
      'root layout'
    )
  })
})
