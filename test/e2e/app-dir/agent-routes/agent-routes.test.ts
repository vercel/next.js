import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('agent-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  const basePath = '/base'
  const withBase = (pathname: string) =>
    pathname === '/' ? basePath : `${basePath}${pathname}`

  const fetchWithAccept = (
    pathname: string,
    accept: string,
    init?: Parameters<typeof next.fetch>[1]
  ) =>
    next.fetch(withBase(pathname), {
      ...init,
      headers: {
        ...init?.headers,
        accept,
      },
    })

  it('should leave /agent.md available for user-owned assets', async () => {
    const res = await next.fetch(withBase('/agent.md'))
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/markdown/)
    expect(res.headers.get('x-robots-tag')).toBeNull()
    expect(body).toBe('explicit public agent markdown route\n')
  })

  it('should serve JSON from the root page on the normal URL', async () => {
    let res: Awaited<ReturnType<typeof next.fetch>> | undefined
    let body: any

    await retry(async () => {
      res = await fetchWithAccept('/', 'application/json')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/json')
      body = await res.json()
    })

    expect(res!.headers.get('x-robots-tag')).toBe('noindex')
    expect(body.sections[0].content).toContain(
      'Root page content for agent route fallback.'
    )
  })

  it('should negotiate markdown on the normal page URL and vary on Accept', async () => {
    const [pageRes, markdownRes] = await Promise.all([
      next.fetch(withBase('/docs')),
      fetchWithAccept('/docs', 'text/markdown'),
    ])
    const body = await markdownRes.text()

    expect(pageRes.status).toBe(200)
    expect(pageRes.headers.get('content-type')).toContain('text/html')
    expect(pageRes.headers.get('vary')).toContain('Accept')

    expect(markdownRes.status).toBe(200)
    expect(markdownRes.headers.get('content-type')).toContain('text/markdown')
    expect(markdownRes.headers.get('x-robots-tag')).toBe('noindex')
    expect(markdownRes.headers.get('vary')).toContain('Accept')
    expect(body).toContain(
      'Docs page content should be available in markdown output.'
    )
    expect(markdownRes.headers.get('cache-control')).toBe(
      pageRes.headers.get('cache-control')
    )
  })

  it('should emit etags for negotiated page responses', async () => {
    const first = await fetchWithAccept('/docs', 'text/markdown')
    const etag = first.headers.get('etag')

    expect(etag).toBeTruthy()

    const second = await fetchWithAccept('/docs', 'text/markdown', {
      headers: {
        'if-none-match': etag!,
      },
    })

    expect(second.status).toBe(304)
  })

  it('should default generateAgent pages to markdown-only mode', async () => {
    const [mdRes, jsonRes] = await Promise.all([
      fetchWithAccept('/manual', 'text/markdown'),
      fetchWithAccept('/manual', 'application/json'),
    ])

    expect(mdRes.status).toBe(200)
    expect(mdRes.headers.get('content-type')).toContain('text/markdown')
    expect(await mdRes.text()).toContain(
      'This section is emitted by generateAgent.'
    )

    expect(jsonRes.status).toBe(406)
    expect(jsonRes.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('should respect json-only routes', async () => {
    const [jsonRes, mdRes] = await Promise.all([
      fetchWithAccept('/json-only', 'application/json'),
      fetchWithAccept('/json-only', 'text/markdown'),
    ])

    expect(jsonRes.status).toBe(200)
    expect(jsonRes.headers.get('content-type')).toContain('application/json')
    expect((await jsonRes.json()).sections[0].content).toContain(
      'This route should only expose agent JSON on the page URL.'
    )

    expect(mdRes.status).toBe(406)
    expect(mdRes.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('should return 406 for routes without agent opt-in while leaving HTML unchanged', async () => {
    const [htmlRes, agentRes] = await Promise.all([
      next.fetch(withBase('/disabled')),
      fetchWithAccept('/disabled', 'text/markdown'),
    ])

    expect(htmlRes.status).toBe(200)
    expect(htmlRes.headers.get('content-type')).toContain('text/html')

    expect(agentRes.status).toBe(406)
    expect(agentRes.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('should support dynamic route negotiation and preserve canonical URLs', async () => {
    const res = await fetchWithAccept('/products/sku-123', 'text/markdown')
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('Product sku-123')
    expect(body).toContain(
      `Canonical: ${new URL(withBase('/products/sku-123'), next.url).toString()}`
    )
  })

  it('should preserve redirect status semantics for negotiated agent responses', async () => {
    const res = await fetchWithAccept('/redirecting', 'text/markdown', {
      redirect: 'manual',
    })

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      new URL(withBase('/docs'), next.url).toString()
    )
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('should preserve not-found status semantics for negotiated agent responses', async () => {
    const res = await fetchWithAccept('/missing', 'text/markdown')

    expect(res.status).toBe(404)
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('should keep sitemap.xml unchanged by default and vary on Accept', async () => {
    const xmlRes = await next.fetch(withBase('/sitemap.xml'))
    const body = await xmlRes.text()

    expect(xmlRes.status).toBe(200)
    expect(xmlRes.headers.get('content-type')).toBe('application/xml')
    expect(xmlRes.headers.get('vary')).toContain('Accept')
    expect(body).toContain('<loc>https://example.com/</loc>')
  })

  it('should prioritize explicit route handler for /sitemap.md', async () => {
    const res = await next.fetch(withBase('/sitemap.md'))
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/markdown')
    expect(body).toBe('explicit sitemap markdown route\n')
  })

  it('should negotiate semantic sitemap markdown and JSON on /sitemap.xml', async () => {
    let markdownRes: Awaited<ReturnType<typeof next.fetch>> | undefined
    let jsonRes: Awaited<ReturnType<typeof next.fetch>> | undefined
    let jsonBody: any

    await retry(async () => {
      ;[markdownRes, jsonRes] = await Promise.all([
        fetchWithAccept('/sitemap.xml', 'text/markdown'),
        fetchWithAccept('/sitemap.xml', 'application/json'),
      ])

      expect(markdownRes.status).toBe(200)
      expect(markdownRes.headers.get('content-type')).toContain('text/markdown')
      expect(markdownRes.headers.get('x-robots-tag')).toBe('noindex')

      expect(jsonRes.status).toBe(200)
      expect(jsonRes.headers.get('content-type')).toContain('application/json')
      expect(jsonRes.headers.get('x-robots-tag')).toBe('noindex')
      jsonBody = await jsonRes.json()
    })

    expect(await markdownRes!.text()).toContain(
      '- [Home](https://example.com/) - Updated daily. Priority 1.'
    )
    expect(jsonBody).toEqual([
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

  it('should default semanticSitemap routes to markdown-only mode on /sitemap.xml', async () => {
    let mdRes: Awaited<ReturnType<typeof next.fetch>> | undefined
    let xmlJsonRes: Awaited<ReturnType<typeof next.fetch>> | undefined
    let suffixJsonRes: Awaited<ReturnType<typeof next.fetch>> | undefined
    let markdownBody = ''

    await retry(async () => {
      ;[mdRes, xmlJsonRes, suffixJsonRes] = await Promise.all([
        fetchWithAccept('/blog/sitemap.xml', 'text/markdown'),
        fetchWithAccept('/blog/sitemap.xml', 'application/json'),
        next.fetch(withBase('/blog/sitemap.json')),
      ])

      expect(mdRes.status).toBe(200)
      expect(mdRes.headers.get('content-type')).toContain('text/markdown')
      markdownBody = await mdRes.text()
      expect(markdownBody).toContain('## Blog Index')
      expect(markdownBody).toContain('Entry point for all blog content.')
      expect(markdownBody).toContain('### Posts')
      expect(markdownBody).toContain('Latest blog posts and tutorials.')

      expect(xmlJsonRes.status).toBe(406)
      expect(xmlJsonRes.headers.get('x-robots-tag')).toBe('noindex')

      expect(suffixJsonRes.status).toBe(404)
      expect(suffixJsonRes.headers.get('x-robots-tag')).toBe('noindex')
    })

    expect(mdRes!.headers.get('x-robots-tag')).toBe('noindex')
    expect(mdRes!.headers.get('vary')).toContain('Accept')
  })

  it('should support dynamic semantic sitemap negotiation on /sitemap.xml', async () => {
    const [mdRes, jsonRes] = await Promise.all([
      fetchWithAccept('/blog/post-1/sitemap.xml', 'text/markdown'),
      fetchWithAccept('/blog/post-1/sitemap.xml', 'application/json'),
    ])

    expect(mdRes.status).toBe(200)
    expect(mdRes.headers.get('content-type')).toContain('text/markdown')
    expect(await mdRes.text()).toContain('Dynamic Blog Index')

    expect(jsonRes.status).toBe(200)
    expect(jsonRes.headers.get('content-type')).toContain('application/json')
    expect((await jsonRes.json())[0]).toMatchObject({
      url: 'https://example.com/blog/dynamic',
      title: 'Dynamic Blog Index',
    })
  })
})
