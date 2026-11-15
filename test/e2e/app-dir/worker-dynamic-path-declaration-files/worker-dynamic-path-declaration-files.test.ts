import { nextTestSetup } from 'e2e-utils'

// Regression test for https://github.com/vercel/next.js/issues/99432
describe('worker-dynamic-path-declaration-files', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should run a worker with a dynamic path from a bundled package', async () => {
    const res = await next.fetch('/api/bundled')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'ready' })
  })

  it('should run a worker with a dynamic path from an external package', async () => {
    const res = await next.fetch('/api/external')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'ready' })
  })
})
