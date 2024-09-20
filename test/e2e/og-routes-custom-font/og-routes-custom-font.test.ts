import { nextTestSetup } from 'e2e-utils'

describe('og-routes-custom-font', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render og with custom font for app routes', async () => {
    const res1 = await next.fetch('/app/og')
    const res2 = await next.fetch('/app/og-node')

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
  })
})
