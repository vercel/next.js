import { nextTestSetup } from 'e2e-utils'

describe('ssg-dynamic-routes-404-page', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      react: '19.3.0-canary-fef12a01-20260413',
      'react-dom': '19.3.0-canary-fef12a01-20260413',
    },
  })

  it('should respond to a not existing page with 404', async () => {
    const res = await next.fetch('/post/2')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('custom 404 page')
  })
})
