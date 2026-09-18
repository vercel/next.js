import { nextTestSetup } from 'e2e-utils'

describe('metadata robots Content-Signal', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should emit global and per-user-agent Content-Signal lines', async () => {
    const res = await next.fetch('/robots.txt')
    const text = await res.text()

    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(text).toMatchInlineSnapshot(`
      "User-Agent: *
      Content-Signal: search=yes, ai-input=yes, ai-train=no
      Allow: /

      User-Agent: GPTBot
      Content-Signal: search=yes, ai-input=no, ai-train=no
      Allow: /

      Sitemap: https://example.com/sitemap.xml
      "
    `)
  })
})
