import { nextTestSetup } from 'e2e-utils'

// DEP0144: the TypeScript config loader reads module.parent in requireFromString,
// so --throw-deprecation prevents this fixture from building or starting.
// @force-gate !futureCompat
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
