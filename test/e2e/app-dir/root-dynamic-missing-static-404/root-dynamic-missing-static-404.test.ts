import { nextTestSetup } from 'e2e-utils'

describe('root-dynamic-missing-static-404', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render dynamic route for normal pages', async () => {
    const $ = await next.render$('/en/about')
    expect($('#page-title').text()).toBe('Dynamic Page')
    expect($('#lang').text()).toBe('en')
    expect($('#page').text()).toBe('about')
  })

  it('should return 404 plain text for missing static assets instead of matching dynamic route', async () => {
    const res = await next.fetch('/_next/static/chunks/non-existent-chunk.js')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(await res.text()).toBe('Not Found')
  })

  it('should return 404 plain text for missing css static assets', async () => {
    const res = await next.fetch('/_next/static/css/non-existent-style.css')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(await res.text()).toBe('Not Found')
  })
})
