import { nextTestSetup } from 'e2e-utils'

describe('future-compat', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('serves requests without deprecated APIs', async () => {
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('hello world')
  })

  // @gate !futureCompat
  it('serves requests that use a deprecated Node.js API', async () => {
    const response = await next.fetch('/deprecated')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('future-compat')
  })
})
