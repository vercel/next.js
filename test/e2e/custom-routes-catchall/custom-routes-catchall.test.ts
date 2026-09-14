import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
;((isNextDev && process.env.TURBOPACK_BUILD) ||
  (isNextStart && process.env.TURBOPACK_DEV)
  ? describe.skip
  : describe)('Custom routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should rewrite and render page correctly', async () => {
    const html = await next.render('/docs/hello')
    expect(html).toMatch(/hello world/)
  })

  it('should rewrite to /_next/static correctly', async () => {
    const bundlePath = `/docs/_next/static/${next.buildId}/_buildManifest.js`
    const data = await next.render(bundlePath)
    expect(data).toContain('/hello')
  })

  it('should rewrite to public/static correctly', async () => {
    const data = await next.render('/docs/static/data.json')
    expect(data).toContain('some data...')
  })

  it('should rewrite to public file correctly', async () => {
    const data = await next.render('/docs/another.txt')
    expect(data).toContain('some text')
  })
})
