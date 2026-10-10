import { nextTestSetup } from 'e2e-utils'

// Returns the markup inside <body> with all <script> tags removed, i.e. the
// markup that is actually painted before client JavaScript runs.
function getRenderedBody(html: string): string {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? ''
  return body.replace(/<script[\s\S]*?<\/script>/g, '').trim()
}

describe('cache-components-not-found-shell', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('renders the page normally when the data exists', async () => {
    const res = await next.fetch('/site-a')
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(getRenderedBody(html)).toContain('ROOT LAYOUT HEADER')
    expect(getRenderedBody(html)).toContain('Hello from site-a')
  })

  // The not-found UI is expected to be server rendered inside the root layout.
  // It currently is not: the response is an empty `__next_error__` document and
  // the not-found UI only exists in the RSC payload, so it paints after
  // hydration. These assertions capture that current, incorrect behavior.
  it.each([
    ['a param returned by generateStaticParams', '/site-b'],
    ['a param not returned by generateStaticParams', '/site-c'],
  ])('serves an empty error shell for notFound() with %s', async (_, url) => {
    const res = await next.fetch(url)
    const html = await res.text()

    expect(res.status).toBe(404)
    expect(html).toMatch(/<html[^>]*id="__next_error__"/)

    // BUG: neither the root layout nor the not-found UI is server rendered.
    expect(html).not.toContain('<header id="root-layout-header"')
    expect(html).not.toContain('<main id="custom-not-found"')
    expect(getRenderedBody(html)).not.toContain('CUSTOM NOT FOUND UI')

    // The not-found UI is only present in the inlined RSC payload.
    expect(html).toContain('CUSTOM NOT FOUND UI')
  })

  it('renders the not-found UI only after hydration', async () => {
    const browser = await next.browser('/site-b')

    expect(await browser.elementByCss('#custom-not-found').text()).toBe(
      'CUSTOM NOT FOUND UI'
    )
    expect(await browser.elementByCss('#root-layout-header').text()).toBe(
      'ROOT LAYOUT HEADER'
    )
  })
})
