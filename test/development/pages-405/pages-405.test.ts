import { nextTestSetup } from 'e2e-utils'

describe('pages-405', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return 405 for POST request to plain page in dev mode', async () => {
    const res = await next.fetch('/', {
      method: 'POST',
    })
    expect(res.status).toBe(405)
  })

  it('should not return 405 for POST request to SSR page', async () => {
    const res = await next.fetch('/ssr', {
      method: 'POST',
    })
    expect(res.status).toBe(200)
  })
})
