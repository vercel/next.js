import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// A PPR resume must not depend on whether the postponed state happens to be
// ASCII. `ä` takes two bytes in UTF-8 but a single UTF-16 code unit, so a
// consumer that measures the postponed state with `String.prototype.length` and
// then slices it by bytes cuts it short: the tail is left in front of the
// served document, and the truncated state can no longer be resumed.
//
// `/ascii` is the control, and differs from `/non-ascii` only in that one
// character. `/revalidated` covers the same invariant for a cache entry
// produced by revalidation rather than one written at build time, because the
// state length for those two is recorded in different places.
describe('ppr-non-ascii-postponed-state', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  for (const pathname of ['/ascii', '/non-ascii']) {
    it(`resumes the postponed boundary on ${pathname}`, async () => {
      expectResumed(await getHtml(pathname))
    })
  }

  // This is the only coverage for the RSC data route, whose state length is
  // recorded separately from the HTML one. A corrupt RSC payload takes the
  // router down with React error #412 ("Connection closed"): the stray byte
  // shifts the first flight row id, so the row the model references never
  // resolves and the navigation ends on the "This page couldn't load" screen
  // instead of the page.
  for (const pathname of ['/ascii', '/non-ascii']) {
    it(`completes a client-side navigation to ${pathname}`, async () => {
      const browser = await next.browser('/')
      await browser.elementByCss(`a[href="${pathname}"]`).click()

      expect(await browser.elementByCss('#resumed').text()).toBe('resumed')
    })
  }

  it('resumes the postponed boundary on a runtime-written entry', async () => {
    const initial = await getHtml('/revalidated')
    const cachedAt = cheerio.load(initial)('#cached-at').text()

    const res = await next.fetch('/api/revalidate?tag=boundary', {
      method: 'POST',
    })
    expect(res.status).toBe(200)

    // Invalidation takes a moment to propagate, and a changed timestamp is what
    // proves the entry was rewritten by the function.
    const rewritten = await retry(
      async () => {
        const html = await getHtml('/revalidated')
        expect(cheerio.load(html)('#cached-at').text()).not.toBe(cachedAt)
        return html
      },
      30_000,
      1_000
    )

    expectResumed(rewritten)
  })

  async function getHtml(pathname: string) {
    const res = await next.fetch(pathname)
    expect(res.status).toBe(200)

    return res.text()
  }

  function expectResumed(html: string) {
    // Anything before the doctype is a leftover of the postponed state.
    expect(html.slice(0, 15)).toBe('<!DOCTYPE html>')

    // Without a resume the boundary only exists as inlined RSC data inside a
    // <script>, which cheerio does not parse.
    expect(cheerio.load(html)('#resumed').length).toBe(1)
  }
})
