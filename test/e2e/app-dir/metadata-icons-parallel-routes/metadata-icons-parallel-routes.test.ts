import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata-icons-parallel-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should present favicon with other icons when parallel routes are presented', async () => {
    const $ = await next.render$('/')
    expect($('link[type="image/x-icon"]').length).toBe(1)
    expect($('link[type="image/svg+xml"]').length).toBe(1)
    expect($('link[rel="apple-touch-icon"]').length).toBe(1)
  })

  it('should render both icon.png and icon.svg when both are present', async () => {
    const $ = await next.render$('/')

    // Should have both PNG and SVG icons for browser fallback support
    const pngIcon = $('link[rel="icon"][type="image/png"]')
    const svgIcon = $('link[rel="icon"][type="image/svg+xml"]')

    expect(pngIcon.length).toBe(1)
    expect(svgIcon.length).toBe(1)

    // Verify the URLs are distinct
    expect(pngIcon.attr('href')).toMatch(/icon\.png/)
    expect(svgIcon.attr('href')).toMatch(/icon\.svg/)
  })

  it('should serve both icon formats', async () => {
    const pngRes = await next.fetch('/icon.png')
    expect(pngRes.status).toBe(200)
    expect(pngRes.headers.get('content-type')).toContain('image/png')

    const svgRes = await next.fetch('/icon.svg')
    expect(svgRes.status).toBe(200)
    expect(svgRes.headers.get('content-type')).toContain('image/svg+xml')
  })

  it('should override parent icon when both static icon presented', async () => {
    const $ = await next.render$('/nested')
    expect($('link[type="image/x-icon"]').length).toBe(1)
    expect($('link[rel="icon"][type="image/png"]').length).toBe(1)
  })

  it('should inherit parent apple icon when child does not present but parent contain static apple icon', async () => {
    const $ = await next.render$('/nested')
    expect($('link[rel="apple-touch-icon"][type="image/png"]').length).toBe(1)
  })
})
