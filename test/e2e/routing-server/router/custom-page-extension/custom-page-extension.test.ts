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

  it('should dispatch a Pages API route with the custom page extension', async () => {
    const response = await next.fetch('/api/echo?value=custom-extension', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'routing contract' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({
      method: 'POST',
      query: { value: 'custom-extension' },
      body: { message: 'routing contract' },
    })
  })
})
