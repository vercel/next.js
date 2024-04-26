import { nextTestSetup } from 'e2e-utils'

describe('unexpected-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should set response status to 500 for unexpected errors in ssr app route', async () => {
    const res = await next.fetch('/ssr-unexpected-error?error=true')
    expect(res.status).toBe(500)
  })

  it('cannot change response status when streaming has started', async () => {
    const res = await next.fetch(
      '/ssr-unexpected-error-after-streaming?error=true'
    )
    expect(res.status).toBe(200)
  })

  it('should set response status to 500 for unexpected errors in isr app route', async () => {
    const res = await next.fetch('/isr-unexpected-error?error=true')
    expect(res.status).toBe(500)
  })
})
