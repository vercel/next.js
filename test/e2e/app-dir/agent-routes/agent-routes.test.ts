import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('agent-routes', () => {
  const isTurbopack = !!process.env.IS_TURBOPACK_TEST

  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should prioritize explicit user routes for /agent.md', async () => {
    const res = await next.fetch('/agent.md')
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/(markdown|plain)/)
    expect(res.headers.get('x-robots-tag')).toBeNull()
    expect(body).toContain('explicit public agent markdown route')
  })

  it('should serve /agent.json from root page agent output', async () => {
    let res: Awaited<ReturnType<typeof next.fetch>> | undefined
    let body: any

    await retry(async () => {
      res = await next.fetch('/agent.json')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/json')
      body = await res.json()
    })

    expect(res!.headers.get('x-robots-tag')).toBe('noindex')
    expect(body.sections[0].content).toContain(
      'Root page content for agent route fallback.'
    )
  })

  it('should expose markdown output and preserve cache-control semantics', async () => {
    const [pageRes, agentRes] = await Promise.all([
      next.fetch('/docs'),
      next.fetch('/docs/agent.md'),
    ])
    const body = await agentRes.text()

    expect(agentRes.status).toBe(200)
    expect(agentRes.headers.get('content-type')).toContain('text/markdown')
    expect(agentRes.headers.get('x-robots-tag')).toBe('noindex')
    expect(body).toContain(
      'Docs page content should be available in markdown output.'
    )
    expect(agentRes.headers.get('cache-control')).toBe(
      pageRes.headers.get('cache-control')
    )
  })

  it('should emit etags for agent endpoints', async () => {
    const first = await next.fetch('/docs/agent.md')
    const etag = first.headers.get('etag')

    expect(etag).toBeTruthy()

    const second = await next.fetch('/docs/agent.md', {
      headers: {
        'if-none-match': etag!,
      },
    })

    expect(second.status).toBe(304)
  })

  it('should default generateAgent pages to markdown-only mode', async () => {
    const [mdRes, jsonRes] = await Promise.all([
      next.fetch('/manual/agent.md'),
      next.fetch('/manual/agent.json'),
    ])

    expect(mdRes.status).toBe(200)
    expect(mdRes.headers.get('content-type')).toContain('text/markdown')
    expect(await mdRes.text()).toContain(
      'This section is emitted by generateAgent.'
    )

    expect(jsonRes.status).toBe(404)
    expect(jsonRes.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('should respect json-only routes', async () => {
    const [jsonRes, mdRes] = await Promise.all([
      next.fetch('/json-only/agent.json'),
      next.fetch('/json-only/agent.md'),
    ])

    expect(jsonRes.status).toBe(200)
    expect(jsonRes.headers.get('content-type')).toContain('application/json')
    expect((await jsonRes.json()).sections[0].content).toContain(
      'This route should only expose /agent.json.'
    )

    expect(mdRes.status).toBe(404)
    expect(mdRes.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('should return 404 for routes without agent opt-in', async () => {
    const res = await next.fetch('/disabled/agent.md')
    expect(res.status).toBe(404)
  })

  it('should support dynamic route agent endpoints', async () => {
    const res = await next.fetch('/products/sku-123/agent.md')
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('Product sku-123')
    expect(body).toContain(
      `Canonical: ${new URL('/products/sku-123', next.url).toString()}`
    )
  })

  it('should preserve redirect status semantics for agent endpoints', async () => {
    const res = await next.fetch('/redirecting/agent.md', {
      redirect: 'manual',
    })

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      new URL('/docs', next.url).toString()
    )
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('should preserve not-found status semantics for agent endpoints', async () => {
    const res = await next.fetch('/missing/agent.md')

    expect(res.status).toBe(404)
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('should keep sitemap.xml unchanged while enabling semantic outputs', async () => {
    const xmlRes = await next.fetch('/sitemap.xml')
    const body = await xmlRes.text()

    expect(xmlRes.status).toBe(200)
    expect(xmlRes.headers.get('content-type')).toBe('application/xml')
    expect(body).toContain('<loc>https://example.com/</loc>')
  })

  it('should prioritize explicit route handler for /sitemap.md', async () => {
    const res = await next.fetch('/sitemap.md')
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/markdown')
    expect(body).toBe('explicit sitemap markdown route\n')
  })

  if (isTurbopack) {
    // TODO: enable semantic sitemap assertions for Turbopack once metadata route loader parity lands.
    it.skip('should serve semantic sitemap JSON when enabled (turbopack)', () => {})

    it.skip('should default semanticSitemap routes to markdown-only mode (turbopack)', () => {})
  } else {
    it('should serve semantic sitemap JSON when enabled', async () => {
      let res: Awaited<ReturnType<typeof next.fetch>> | undefined
      let body: any

      await retry(async () => {
        res = await next.fetch('/sitemap.json')
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toContain('application/json')
        body = await res.json()
      })

      expect(res!.headers.get('x-robots-tag')).toBe('noindex')
      expect(body).toEqual([
        {
          url: 'https://example.com/',
          title: 'Home',
          summary: 'Updated daily. Priority 1.',
        },
        {
          url: 'https://example.com/docs',
          title: 'Docs',
          summary: 'Updated weekly. Priority 0.7.',
        },
      ])
    })

    it('should default semanticSitemap routes to markdown-only mode', async () => {
      let mdRes: Awaited<ReturnType<typeof next.fetch>> | undefined
      let jsonRes: Awaited<ReturnType<typeof next.fetch>> | undefined
      let markdownBody = ''

      await retry(async () => {
        ;[mdRes, jsonRes] = await Promise.all([
          next.fetch('/blog/sitemap.md'),
          next.fetch('/blog/sitemap.json'),
        ])

        expect(mdRes.status).toBe(200)
        expect(mdRes.headers.get('content-type')).toContain('text/markdown')
        markdownBody = await mdRes.text()
        expect(markdownBody).toContain(
          '[Blog Index](https://example.com/blog) - Entry point for all blog content.'
        )

        expect(jsonRes.status).toBe(404)
        expect(jsonRes.headers.get('x-robots-tag')).toBe('noindex')
      })

      expect(mdRes!.headers.get('x-robots-tag')).toBe('noindex')
    })
  }
})
