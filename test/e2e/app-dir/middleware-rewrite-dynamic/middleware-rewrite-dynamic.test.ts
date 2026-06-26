import { nextTestSetup } from 'e2e-utils'

describe('app dir - middleware rewrite dynamic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should properly rewrite for /robots.txt', async () => {
    const res = await next.fetch('/robots.txt')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Render next')
  })

  it('should properly rewrite for /favicon.ico', async () => {
    const res = await next.fetch('/favicon.ico')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Render next')
  })
})
