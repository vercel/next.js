import { nextTestSetup } from 'e2e-utils'

describe('empty-ssg-fallback', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not cache 404 error page', async () => {
    const res = await next.fetch('/any-non-existed')
    expect(res.status).toBe(404)
  })
})
