import { nextTestSetup } from 'e2e-utils'

describe('cacheComponents dynamic routes', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('returns 404 for invalid dynamic routes on the first request', async () => {
    const first = await next.fetch('/this-page-does-not-exist', {
      redirect: 'manual',
    })
    expect(first.status).toBe(404)

    const second = await next.fetch('/this-page-does-not-exist', {
      redirect: 'manual',
    })
    expect(second.status).toBe(404)
  })

  it('returns 200 for dynamic routes that are valid but not prerendered', async () => {
    const res = await next.fetch('/my-new-page')

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Hello, World!')
  })
})
