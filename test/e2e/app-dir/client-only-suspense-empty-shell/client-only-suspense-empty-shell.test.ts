import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('client-only-suspense-empty-shell', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe.each([
    { blockedVia: 'instant = false', pathname: '/' },
    { blockedVia: 'Suspense above body', pathname: '/suspense-above-body' },
  ])(
    'page that only suspends in a client component, blocked via $blockedVia',
    ({ pathname }) => {
      it('serves complete HTML from a resume render', async () => {
        const $ = await next.render$(`${pathname}?query=foo`)
        expect($('#search').text()).toBe('search: query=foo')
        expect($('#sentinel').text()).toBe('at runtime')
      })

      it('renders in the browser', async () => {
        const browser = await next.browser(`${pathname}?query=foo`)
        await retry(async () => {
          const text = await browser.elementByCss('#search').text()
          expect(text).toBe('search: query=foo')
        })
      })
    }
  )
})
