import { nextTestSetup } from 'e2e-utils'

describe('navigation-redirect-import', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work using fetch', async () => {
    const res = await next.fetch('/route-handler')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello world')
  })
})
