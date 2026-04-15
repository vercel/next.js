import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
;((isNextDev && process.env.TURBOPACK_BUILD) ||
  (isNextStart && process.env.TURBOPACK_DEV)
  ? describe.skip
  : describe)('Custom page extension', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work with normal page', async () => {
    const html = await next.render('/blog')
    expect(html).toContain('Blog - CPE')
  })

  it('should work dynamic page', async () => {
    const html = await next.render('/blog/nextjs')
    expect(html).toContain('Post - nextjs')
  })
})
