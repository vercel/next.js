/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'

describe('Async modules', () => {
  const { next, isNextDev: dev } = nextTestSetup({
    files: __dirname,
  })

  it('ssr async page modules', async () => {
    const $ = await next.render$('/')
    expect($('#app-value').text()).toBe('hello')
    expect($('#page-value').text()).toBe('42')
  })

  it('csr async page modules', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#app-value').text()).toBe('hello')
    expect(await browser.elementByCss('#page-value').text()).toBe('42')
    expect(await browser.elementByCss('#doc-value').text()).toBe('doc value')
  })

  it('works on async api routes', async () => {
    const res = await next.fetch('/api/hello')
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result).toHaveProperty('value', 42)
  })

  it('works with getServerSideProps', async () => {
    const browser = await next.browser('/gssp')
    expect(await browser.elementByCss('#gssp-value').text()).toBe('42')
  })

  it('works with getStaticProps', async () => {
    const browser = await next.browser('/gsp')
    expect(await browser.elementByCss('#gsp-value').text()).toBe('42')
  })

  it('can render async 404 pages', async () => {
    const browser = await next.browser('/dhiuhefoiahjeoij')
    expect(await browser.elementByCss('#content-404').text()).toBe("hi y'all")
  })
  ;(dev ? it.skip : it)('can render async error page', async () => {
    const browser = await next.browser('/make-error')
    // eslint-disable-next-line jest/no-standalone-expect
    expect(await browser.elementByCss('#content-error').text()).toBe(
      'hello error'
    )
  })
})
