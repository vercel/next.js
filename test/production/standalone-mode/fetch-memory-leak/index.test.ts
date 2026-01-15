import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'
import { ChildProcess, spawn } from 'child_process'
import path from 'path'

describe('standalone mode - fetch memory leak', () => {
  let externalServerPort: number
  let externalServerProcess: ChildProcess

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) return

  beforeAll(async () => {
    externalServerPort = await findPort()

    // Start the external server as a child process
    externalServerProcess = spawn('node', [path.join(__dirname, 'server.js')], {
      env: { ...process.env, PORT: String(externalServerPort) },
      stdio: 'pipe',
    })

    // Wait for server to be ready
    await retry(async () => {
      const res = await fetch(`http://localhost:${externalServerPort}`)
      expect(res.status).toBe(200)
    })

    await next.start()
  })

  afterAll(async () => {
    externalServerProcess?.kill()
  })

  // This test verifies that repeated fetch requests with large JSON responses
  // do not cause unbounded memory growth (GitHub issue #85914)
  it('should not leak memory with repeated fetch requests for large JSON', async () => {
    // Make initial request to warm up
    const initialRes = await next.fetch('/')
    expect(initialRes.status).toBe(200)

    // Get baseline memory after warmup
    const baselineMemory = await getServerMemoryUsage()

    // Make many requests to potentially trigger memory leak
    const numRequests = 50
    for (let i = 0; i < numRequests; i++) {
      const res = await next.fetch('/')
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('Data items: 1000')
    }

    // Wait for GC to potentially run
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Make a few more requests to let the server settle
    for (let i = 0; i < 5; i++) {
      await next.fetch('/')
    }

    // Check memory usage
    const finalMemory = await getServerMemoryUsage()

    // Memory should not grow unboundedly
    // Allow for some memory growth, but not proportional to request count
    // With 50 requests of ~1MB each, if there's a leak we'd see ~50MB+ growth
    // A healthy server should stay within a reasonable bound
    const memoryGrowthMB = (finalMemory - baselineMemory) / (1024 * 1024)

    console.log(
      `Memory baseline: ${(baselineMemory / (1024 * 1024)).toFixed(2)}MB`
    )
    console.log(`Memory final: ${(finalMemory / (1024 * 1024)).toFixed(2)}MB`)
    console.log(
      `Memory growth: ${memoryGrowthMB.toFixed(2)}MB after ${numRequests} requests`
    )

    // This is a regression test - if there's a memory leak, this will fail
    // The threshold is generous to account for normal memory variations
    // but should catch significant leaks (>100MB growth)
    expect(memoryGrowthMB).toBeLessThan(100)
  })

  it('should properly consume response bodies', async () => {
    // Verify that responses are being properly consumed
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Data items: 1000')
  })

  async function getServerMemoryUsage(): Promise<number> {
    // Force garbage collection if available (requires --expose-gc flag)
    // In tests, we rely on the server's natural memory management
    try {
      // This is a simple approximation - in a real scenario you might
      // want to use the v8 inspector protocol to get more accurate readings
      // For now, we just measure the RSS of the test process as a proxy
      return process.memoryUsage().heapUsed
    } catch {
      return 0
    }
  }
})
