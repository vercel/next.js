import { nextTestSetup } from 'e2e-utils'

describe('custom-cache-control', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should have custom cache-control for app-ssg prerendered', async () => {
    const res = await next.fetch('/app-ssg/first')
    expect(res.headers.get('cache-control')).toBe(
      isNextDev ? 'no-store, must-revalidate' : 's-maxage=30'
    )
  })

  it('should have custom cache-control for app-ssg lazy', async () => {
    const res = await next.fetch('/app-ssg/lazy')
    expect(res.headers.get('cache-control')).toBe(
      isNextDev ? 'no-store, must-revalidate' : 's-maxage=31'
    )
  })

  it('should have default cache-control for app-ssg another', async () => {
    const res = await next.fetch('/app-ssg/another')
    expect(res.headers.get('cache-control')).toBe(
      isNextDev
        ? 'no-store, must-revalidate'
        : 's-maxage=120, stale-while-revalidate'
    )
  })

  it('should have custom cache-control for app-ssr', async () => {
    const res = await next.fetch('/app-ssr')
    expect(res.headers.get('cache-control')).toBe(
      isNextDev ? 'no-store, must-revalidate' : 's-maxage=32'
    )
  })

  it('should have custom cache-control for auto static page', async () => {
    const res = await next.fetch('/pages-auto-static')
    expect(res.headers.get('cache-control')).toBe(
      isNextDev ? 'no-store, must-revalidate' : 's-maxage=33'
    )
  })

  it('should have custom cache-control for pages-ssg prerendered', async () => {
    const res = await next.fetch('/pages-ssg/first')
    expect(res.headers.get('cache-control')).toBe(
      isNextDev ? 'no-store, must-revalidate' : 's-maxage=34'
    )
  })

  it('should have custom cache-control for pages-ssg lazy', async () => {
    const res = await next.fetch('/pages-ssg/lazy')
    expect(res.headers.get('cache-control')).toBe(
      isNextDev ? 'no-store, must-revalidate' : 's-maxage=35'
    )
  })

  it('should have default cache-control for pages-ssg another', async () => {
    const res = await next.fetch('/pages-ssg/another')
    expect(res.headers.get('cache-control')).toBe(
      isNextDev
        ? 'no-store, must-revalidate'
        : 's-maxage=120, stale-while-revalidate'
    )
  })

  it('should have default cache-control for pages-ssr', async () => {
    const res = await next.fetch('/pages-ssr')
    expect(res.headers.get('cache-control')).toBe(
      isNextDev ? 'no-store, must-revalidate' : 's-maxage=36'
    )
  })
})
