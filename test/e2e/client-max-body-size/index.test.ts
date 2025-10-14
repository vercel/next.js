import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

describe('client-max-body-size', () => {
  describe('default 10MB limit', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      // Deployed environment has it's own configured limits.
      skipDeployment: true,
    })

    if (skipped) return

    it('should accept request body over 10MB but only buffer up to limit', async () => {
      const bodySize = 11 * 1024 * 1024 // 11MB
      const body = 'x'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      // Should only buffer up to 10MB, not the full 11MB
      expect(responseBody.bodySize).toBeLessThanOrEqual(10 * 1024 * 1024)
      expect(responseBody.bodySize).toBeLessThan(bodySize)
      expect(next.cliOutput).toContain(
        'Request body exceeded 10MB for /api/echo'
      )
    })

    it('should accept request body at exactly 10MB', async () => {
      const bodySize = 10 * 1024 * 1024 // 10MB
      const body = 'y'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      expect(responseBody.bodySize).toBe(bodySize)
    })

    it('should accept request body under 10MB', async () => {
      const bodySize = 5 * 1024 * 1024 // 5MB
      const body = 'z'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      expect(responseBody.bodySize).toBe(bodySize)
    })
  })

  describe('custom limit with string format', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      nextConfig: {
        experimental: {
          proxyClientMaxBodySize: '5mb',
        },
      },
    })

    if (skipped) return

    it('should accept request body over custom 5MB limit but only buffer up to limit', async () => {
      const bodySize = 6 * 1024 * 1024 // 6MB
      const body = 'a'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      // Should only buffer up to 5MB, not the full 6MB
      expect(responseBody.bodySize).toBeLessThanOrEqual(5 * 1024 * 1024)
      expect(responseBody.bodySize).toBeLessThan(bodySize)
      expect(next.cliOutput).toContain(
        'Request body exceeded 5MB for /api/echo'
      )
    })

    it('should accept request body under custom 5MB limit', async () => {
      const bodySize = 4 * 1024 * 1024 // 4MB
      const body = 'b'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      expect(responseBody.bodySize).toBe(bodySize)
    })
  })

  describe('custom limit with number format', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      nextConfig: {
        experimental: {
          proxyClientMaxBodySize: 2 * 1024 * 1024, // 2MB in bytes
        },
      },
    })

    if (skipped) return

    it('should accept request body over custom 2MB limit but only buffer up to limit', async () => {
      const bodySize = 3 * 1024 * 1024 // 3MB
      const body = 'c'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      // Should only buffer up to 2MB, not the full 3MB
      expect(responseBody.bodySize).toBeLessThanOrEqual(2 * 1024 * 1024)
      expect(responseBody.bodySize).toBeLessThan(bodySize)
      expect(next.cliOutput).toContain(
        'Request body exceeded 2MB for /api/echo'
      )
    })

    it('should accept request body under custom 2MB limit', async () => {
      const bodySize = 1 * 1024 * 1024 // 1MB
      const body = 'd'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      expect(responseBody.bodySize).toBe(bodySize)
    })
  })

  describe('large custom limit', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      nextConfig: {
        experimental: {
          proxyClientMaxBodySize: '50mb',
        },
      },
    })

    if (skipped) return

    it('should accept request body up to 50MB with custom limit', async () => {
      const bodySize = 20 * 1024 * 1024 // 20MB
      const body = 'e'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      expect(responseBody.bodySize).toBe(bodySize)
    })

    it('should accept request body over custom 50MB limit but only buffer up to limit', async () => {
      const bodySize = 51 * 1024 * 1024 // 51MB
      const body = 'f'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/echo',
        {},
        {
          body,
          method: 'POST',
        }
      )

      expect(res.status).toBe(200)
      const responseBody = await res.json()
      expect(responseBody.message).toBe('Hello World')
      // Should only buffer up to 50MB, not the full 51MB
      expect(responseBody.bodySize).toBeLessThanOrEqual(50 * 1024 * 1024)
      expect(responseBody.bodySize).toBeLessThan(bodySize)
      expect(next.cliOutput).toContain(
        'Request body exceeded 50MB for /api/echo'
      )
    })
  })
})
