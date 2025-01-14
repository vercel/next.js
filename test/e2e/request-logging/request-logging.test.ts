import { createNext, FileRef, NextInstance } from 'e2e-utils'

import { fetchViaHTTP } from 'next-test-utils'
import path from 'path'

describe('Request Logging', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
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
    const logs: string[] = []
    next.on('stdout', (log) => {
      if (log.includes('GET ')) {
        logs.push(log)
      }
    })

    // Make requests that should be ignored based on config
    await fetchViaHTTP(next.url, '/api/hello')
    await fetchViaHTTP(next.url, '/healthcheck')
    await fetchViaHTTP(next.url, '/_next/static/test.js')

    // Make a request that should be logged
    await fetchViaHTTP(next.url, '/')

    // Wait for logs to be collected
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Verify API and healthcheck requests were not logged
    expect(logs.filter((l) => l.includes('GET /api/hello'))).toHaveLength(0)
    expect(logs.filter((l) => l.includes('GET /healthcheck'))).toHaveLength(0)
    expect(logs.filter((l) => l.includes('GET /_next/static'))).toHaveLength(0)

    // Verify normal page request was logged
    expect(logs.filter((l) => l.includes('GET /'))).toHaveLength(1)
  })

  it('should handle disabled request logging', async () => {
    const logs: string[] = []
    next.on('stdout', (log) => {
      if (log.includes('GET ')) {
        logs.push(log)
      }
    })

    // Update config to disable logging
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

    // Make requests
    await fetchViaHTTP(next.url, '/')
    await fetchViaHTTP(next.url, '/api/hello')

    // Wait for logs to be collected
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Verify no requests were logged
    expect(logs).toHaveLength(0)
  })
})
