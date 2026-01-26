import { nextTestSetup } from 'e2e-utils'

describe('node-worker-threads', () => {
  const { next, skipped, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      pino: '9.6.0',
    },
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

  it('should handle pino logger with transport (thread-stream)', async () => {
    // Pino with transports uses thread-stream internally, which creates worker_threads
    // with a broad pattern like join(__dirname, 'lib', 'worker.js') that can match
    // non-evaluatable files like package.json. This tests that we properly downgrade
    // those errors to warnings via loose_errors.
    const res = await next.fetch('/api/pino-test')
    const data = await res.json()
    console.log('Pino test response:', data)
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
  })
})
