import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression test for https://github.com/vercel/next.js/issues/73965
//
// `redirect()` to a URL with non-ASCII characters wrote the URL into the
// `x-action-redirect` or `Location` header as is. Node rejects such header
// values with `ERR_INVALID_CHAR`, and `new Headers()` throws a `TypeError`, so
// the request failed with a 500.
describe('non-ASCII redirect', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const DESTINATION = encodeURI('/destination/テスト')

  it('redirects from a server action', async () => {
    const browser = await next.browser('/')
    await browser.elementById('submit').click()

    await retry(async () => {
      expect(await browser.url()).toBe(`${next.url}${DESTINATION}`)
    })
    expect(await browser.elementById('destination').text()).toBe('destination')
  })

  it('redirects from a server action without JavaScript', async () => {
    const browser = await next.browser('/', { disableJavaScript: true })
    await browser.elementById('submit').click()

    await retry(async () => {
      expect(await browser.url()).toBe(`${next.url}${DESTINATION}`)
    })
    expect(await browser.elementById('destination').text()).toBe('destination')
  })

  it.each(['/redirect/static', '/api/redirect'])(
    'redirects from %s',
    async (pathname) => {
      const res = await next.fetch(pathname, { redirect: 'manual' })

      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location'), next.url).pathname).toBe(
        DESTINATION
      )
    }
  )
})
