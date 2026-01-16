import { nextTestSetup } from 'e2e-utils'

describe('node-worker-threads', () => {
  const { next, skipped, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  // These tests are Turbopack-specific since they rely on Turbopack's worker bundling
  if (!isTurbopack) {
    it.skip('webpack doesnt support bundling worker-threads', () => {})
    return
  }

  it('should handle simple worker with relative path', async () => {
    const res = await next.fetch('/api/simple-worker-test')
    const data = await res.json()
    console.log('Simple worker response:', data)
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.message).toBe('pong from simple worker')
  })

  it('should handle self-referencing worker with __filename', async () => {
    const res = await next.fetch('/api/worker-test')
    const data = await res.json()
    console.log('Self-ref worker response:', data)
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.message).toBe('pong')
  })
})
