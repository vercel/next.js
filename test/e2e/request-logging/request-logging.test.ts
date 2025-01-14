import path from 'path'

import { createNext, FileRef, NextInstance } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

async function waitForLogPattern(
  output: () => string,
  pattern: string,
  timeout = 200
) {
  const start = performance.now()
  while (performance.now() - start < timeout) {
    if (output().includes(pattern)) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return false
}

describe('Request Logging', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      // start in dev mode because request logging is only available in dev mode
      startCommand: 'pnpm next dev',
      files: {
        'pages/index.js': new FileRef(
          path.join(__dirname, 'app/pages/index.js')
        ),
        'pages/api/hello.js': new FileRef(
          path.join(__dirname, 'app/pages/api/hello.js')
        ),
        'next.config.js': new FileRef(
          path.join(__dirname, 'app/next.config.js')
        ),
      },
    })
  })

  afterAll(() => next.destroy())

  it('should not log requests matching ignore pattern', async () => {
    // Make requests that should be ignored based on config
    const output = next.getCliOutputFromHere()
    let response = await fetchViaHTTP(next.appPort, '/api/hello')
    expect(response.status).toBe(200)

    response = await fetchViaHTTP(next.appPort, '/healthcheck')
    expect(response.status).toBe(404)

    response = await fetchViaHTTP(next.appPort, '/_next/static/test.js')
    expect(response.status).toBe(404)

    // Make a request that should be logged
    response = await fetchViaHTTP(next.appPort, '/')
    expect(response.status).toBe(200)

    // Wait for GET / to be logged
    await waitForLogPattern(output, 'GET /', 1000)

    expect(output()).not.toContain('GET /api/hello')
    expect(output()).not.toContain('GET /healthcheck')
    expect(output()).not.toContain('GET /_next/static/test.js')
    expect(output()).toContain('GET /')
  })

  it('should handle disabled request logging', async () => {
    // Update config to disable logging
    const output = next.getCliOutputFromHere()

    await next.patchFile(
      'next.config.js',
      `
      module.exports = {
        logging: {
          incomingRequest: false
        }
      }
      `
    )

    await waitForLogPattern(output, 'Ready', 1000)

    // Make requests
    let response = await fetchViaHTTP(next.appPort, '/')
    expect(response.status).toBe(200)

    response = await fetchViaHTTP(next.appPort, '/api/hello')
    expect(response.status).toBe(200)

    // Wait for GET / to be logged
    await waitForLogPattern(output, 'GET /', 1000)

    // Verify no requests were logged
    expect(output()).not.toContain('GET /')
    expect(output()).not.toContain('GET /api/hello')
  })
})
