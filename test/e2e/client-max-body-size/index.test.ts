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

    it('should reject request body over 10MB by default', async () => {
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

      expect(res.status).toBe(400)
      expect(next.cliOutput).toContain('Request body exceeded 10MB')
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
      const responseBody = await res.text()
      expect(responseBody).toBe('Hello World')
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
      const responseBody = await res.text()
      expect(responseBody).toBe('Hello World')
    })
  })

  describe('custom limit with string format', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      nextConfig: {
        experimental: {
          middlewareClientMaxBodySize: '5mb',
        },
      },
    })

    if (skipped) return

    it('should reject request body over custom 5MB limit', async () => {
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

      expect(res.status).toBe(400)
      expect(next.cliOutput).toContain('Request body exceeded 5MB')
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
      const responseBody = await res.text()
      expect(responseBody).toBe('Hello World')
    })
  })

  describe('custom limit with number format', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      nextConfig: {
        experimental: {
          middlewareClientMaxBodySize: 2 * 1024 * 1024, // 2MB in bytes
        },
      },
    })

    if (skipped) return

    it('should reject request body over custom 2MB limit', async () => {
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

      expect(res.status).toBe(400)
      expect(next.cliOutput).toContain('Request body exceeded 2MB')
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
      const responseBody = await res.text()
      expect(responseBody).toBe('Hello World')
    })
  })

  describe('large custom limit', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      nextConfig: {
        experimental: {
          middlewareClientMaxBodySize: '50mb',
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
      const responseBody = await res.text()
      expect(responseBody).toBe('Hello World')
    })

    it('should reject request body over custom 50MB limit', async () => {
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

      expect(res.status).toBe(400)
      expect(next.cliOutput).toContain('Request body exceeded 50MB')
    })
  })
})
