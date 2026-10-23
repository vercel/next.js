import { nextTestSetup } from 'e2e-utils'

describe('app dir - not-found - dynamic segment notFound()', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should server render custom not-found copy inside layout when notFound() is thrown from a dynamic segment', async () => {
    // Exact reproduction from issue #100596:
    // /nope matches app/[slug]/page.tsx which throws notFound()
    const res = await next.fetch('/nope')
    expect(res.status).toBe(404)

    const rawHtml = await res.text()
    // Must NOT be the empty error recovery shell
    expect(rawHtml).not.toContain('id="__next_error__"')
    expect(rawHtml).toMatch(/<html[^>]*\blang="en"/)

    // Content should be present in the initial server HTML (for crawlers and no-JS clients)
    const markup = rawHtml.replace(/<script\b[\s\S]*?<\/script>/g, '')
    expect(markup).toContain('Custom not-found copy')
    expect(markup).toContain('Site Header')
  })

  it('should have parity with an unmatched route', async () => {
    const res = await next.fetch('/this/does/not/exist')
    expect(res.status).toBe(404)

    const rawHtml = await res.text()
    expect(rawHtml).not.toContain('id="__next_error__"')
    expect(rawHtml).toMatch(/<html[^>]*\blang="en"/)

    const markup = rawHtml.replace(/<script\b[\s\S]*?<\/script>/g, '')
    expect(markup).toContain('Custom not-found copy')
    expect(markup).toContain('Site Header')
  })

  it('should render the matched known static param with status 200', async () => {
    const res = await next.fetch('/known')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('Known item: known')
  })
})
