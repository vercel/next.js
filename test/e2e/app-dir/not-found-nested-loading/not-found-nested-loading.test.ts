import { nextTestSetup } from 'e2e-utils'

describe('not-found-nested-loading', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return 404 for unknown dynamicParams: false route when sibling dynamic route exists', async () => {
    const res = await next.fetch('/brands/does-not-exist')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('not-found page')
  })

  it('should return 404 for unknown dynamicParams: true route with loading.tsx', async () => {
    const res = await next.fetch('/laptops/does-not-exist')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('not-found page')
  })

  it('should return 200 for known params', async () => {
    const res1 = await next.fetch('/brands/apple')
    expect(res1.status).toBe(200)

    const res2 = await next.fetch('/laptops/macbook-pro')
    expect(res2.status).toBe(200)
  })
})
