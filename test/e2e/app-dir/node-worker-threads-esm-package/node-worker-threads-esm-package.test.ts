import { nextTestSetup } from 'e2e-utils'

describe('node-worker-threads-esm-package', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      // An ESM package that starts a worker next to its own file, which it
      // locates with `fileURLToPath(import.meta.url)`.
      'worker-pkg': 'file:./worker-pkg',
    },
  })

  it('should start a worker from a path next to import.meta.url', async () => {
    const res = await next.fetch('/api/esm')
    expect(await res.json()).toEqual({ message: 'ready' })
    expect(res.status).toBe(200)
  })

  it('should start a worker from a default parameter path next to import.meta.url', async () => {
    const res = await next.fetch('/api/esm-default-param')
    expect(await res.json()).toEqual({ message: 'ready' })
    expect(res.status).toBe(200)
  })
})
