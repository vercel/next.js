import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('non-ascii-route-segments', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each([
    ['/교사-월급-계산기', 'calculator'],
    ['/日本語', 'Japanese'],
    ['/العربية', 'Arabic'],
    ['/인코딩', 'encoded directory'],
  ])('renders %s on a direct request', async (pathname, expected) => {
    const response = await next.fetch(encodeURI(pathname))
    expect(response.status).toBe(200)
    const $ = await next.render$(encodeURI(pathname))
    expect($('#result').text()).toBe(expected)
  })

  it.each(['/블로그', '/блог'])(
    'preserves parameter values under %s',
    async (pathname) => {
      for (const [slug, expected] of [
        ['hello', 'hello'],
        ['hello%2Fworld', 'hello/world'],
        ['hello%252Fworld', 'hello%2Fworld'],
        ['100%25', '100%'],
        [encodeURIComponent('한글'), '한글'],
      ]) {
        const $ = await next.render$(`${encodeURI(pathname)}/${slug}`)
        if (pathname === '/블로그') {
          const baseline = await next.render$(`/blog/${slug}`)
          expect(baseline('#result').text()).not.toBe('')
          expect($('#result').text()).toBe(baseline('#result').text())
        } else {
          expect($('#result').text()).toBe(expected)
        }
      }
    }
  )

  it('accepts lowercase percent escapes', async () => {
    const $ = await next.render$(encodeURI('/교사-월급-계산기').toLowerCase())
    expect($('#result').text()).toBe('calculator')
  })

  it.each([
    ['static', 'calculator'],
    ['dynamic', 'hello%252Fworld'],
    ['prerendered', 'Japanese'],
    ['pages', 'hello%2Fworld'],
  ])('navigates to %s and survives reload', async (id, expected) => {
    const browser = await next.browser('/')
    await browser.elementByCss(`#${id}`).click()
    await retry(async () => {
      expect(await browser.elementByCss('#result').text()).toBe(expected)
    })
    await browser.refresh()
    expect(await browser.elementByCss('#result').text()).toBe(expected)
  })
})
