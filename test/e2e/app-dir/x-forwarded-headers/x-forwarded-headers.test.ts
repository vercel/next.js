import { createNextDescribe } from 'e2e-utils'

createNextDescribe('x-forwarded-headers', { files: __dirname }, ({ next }) => {
  it('should include x-forwarded-* headers', async () => {
    const res = await next.fetch('/')
    const headers = await res.json()
    const url = new URL(next.url)

    expect(headers['x-forwarded-host']).toBe(url.host)
    expect(headers['x-forwarded-port']).toBe(url.port)
    expect(headers['x-forwarded-proto']).toBe(url.protocol.replace(':', ''))
    expect(headers['middleware-x-forwarded-host']).toBe(url.host)
    expect(headers['middleware-x-forwarded-port']).toBe(url.port)
    expect(headers['middleware-x-forwarded-proto']).toBe(
      url.protocol.replace(':', '')
    )
  })

  describe('host header exists', () => {
    it('should include x-forwarded-* headers relative to host', async () => {
      const url = new URL(next.url)
      const reqHeaders = {
        host: `subdomain.localhost:${url.port}`,
      }
      const res = await next.fetch('/', {
        headers: reqHeaders,
      })
      const headers = await res.json()

      expect(headers['x-forwarded-host']).toBe(reqHeaders.host)
      expect(headers['x-forwarded-port']).toBe(url.port)
      expect(headers['x-forwarded-proto']).toBe(url.protocol.replace(':', ''))
      expect(headers['middleware-x-forwarded-host']).toBe(reqHeaders.host)
      expect(headers['middleware-x-forwarded-port']).toBe(url.port)
      expect(headers['middleware-x-forwarded-proto']).toBe(
        url.protocol.replace(':', '')
      )
    })
  })

  describe('already assigned', () => {
    it('should not override existing x-forwarded-* headers', async () => {
      const url = new URL(next.url)
      const reqHeaders = {
        host: `subdomain.localhost:${url.port}`,
        port: '1234',
        proto: 'https',
      }
      const res = await next.fetch('/', {
        headers: {
          host: 'override.localhost',
          'x-forwarded-host': reqHeaders.host,
          'x-forwarded-port': reqHeaders.port,
          'x-forwarded-proto': reqHeaders.proto,
        },
      })
      const headers = await res.json()

      expect(headers['x-forwarded-host']).toBe(reqHeaders.host)
      expect(headers['x-forwarded-port']).toBe(reqHeaders.port)
      expect(headers['x-forwarded-proto']).toBe(reqHeaders.proto)
      expect(headers['middleware-x-forwarded-host']).toBe(reqHeaders.host)
      expect(headers['middleware-x-forwarded-port']).toBe(reqHeaders.port)
      expect(headers['middleware-x-forwarded-proto']).toBe(reqHeaders.proto)
    })
  })
})
