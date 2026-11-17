import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// The legacy Vercel builder does not support these parameter-matching outputs.
// @force-gate !deploy || adapter
describe('param-matching-overlap', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    ['/docs/messages/known', '#specific', 'known'],
    ['/docs/messages/unknown', '#catch-all', 'messages/unknown'],
    ['/docs/ordinary', '#catch-all', 'ordinary'],
  ])(
    'serves a document request for %s through the matching route',
    async (pathname, selector, text) => {
      const res = await next.fetch(pathname)
      expect(res.status).toBe(200)
      expect(
        cheerio
          .load(await res.text())(selector)
          .text()
      ).toBe(text)
    }
  )

  async function fetchFollowingRedirects(
    pathname: string,
    headers: Record<string, string>
  ) {
    let res = await next.fetch(pathname, { headers, redirect: 'manual' })
    let redirects = 0
    while (res.status === 307 && redirects < 5) {
      redirects++
      res = await next.fetch(res.headers.get('location')!, {
        headers,
        redirect: 'manual',
      })
    }
    return { status: res.status, redirects }
  }

  it.each(['/docs/messages/unknown', '/docs/messages/known', '/docs/ordinary'])(
    'answers an RSC request for %s after one redirect',
    async (pathname) => {
      expect(
        await fetchFollowingRedirects(pathname, { RSC: '1', 'Next-Url': '/' })
      ).toEqual({ status: 200, redirects: 1 })
    }
  )

  it('navigates to the less specific route without reloading the document', async () => {
    const browser = await next.browser('/')
    await browser.eval('window.__navSentinel = true')
    await browser.elementById('to-unknown').click()
    await retry(async () => {
      expect(await browser.elementById('catch-all').text()).toBe(
        'messages/unknown'
      )
    })
    expect(await browser.eval('window.__navSentinel')).toBe(true)
  })

  it('navigates to the closed route without reloading the document', async () => {
    const browser = await next.browser('/')
    await browser.eval('window.__navSentinel = true')
    await browser.elementById('to-known').click()
    await retry(async () => {
      expect(await browser.elementById('specific').text()).toBe('known')
    })
    expect(await browser.eval('window.__navSentinel')).toBe(true)
  })
})
