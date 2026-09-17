import { nextTestSetup } from 'e2e-utils'

describe('markdown for agents', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('serves HTML without a markdown Accept header', async () => {
    const res = await next.fetch('/')
    const html = await res.text()
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('<h1>Home</h1>')
  })

  it('serves colocated page.md on the same URL', async () => {
    const res = await next.fetch('/', {
      headers: { Accept: 'text/markdown' },
    })
    const body = await res.text()
    expect(res.headers.get('content-type')).toContain('text/markdown')
    expect(res.headers.get('vary') || '').toMatch(/accept/i)
    expect(body).toContain('# Home')
    expect(body).toContain('Authored markdown')
    expect(body).not.toContain('<h1>')
  })

  it('auto-converts a page without page.md and documents actions', async () => {
    const res = await next.fetch('/about', {
      headers: { Accept: 'text/markdown' },
    })
    const body = await res.text()
    expect(res.headers.get('content-type')).toContain('text/markdown')
    expect(body).toContain('# About')
    expect(body).toContain('## Actions')
    expect(body).toContain('subscribe')
    expect(body).toContain('POST /about')
    expect(body).not.toContain('Site nav')
    expect(body).not.toContain('Footer chrome')
  })

  it('serves suffix URLs when markdown.suffix is enabled', async () => {
    const res = await next.fetch('/index.md')
    const body = await res.text()
    expect(res.headers.get('content-type')).toContain('text/markdown')
    expect(body).toContain('Authored markdown')
  })
})
