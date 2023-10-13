import { createNextDescribe } from 'e2e-utils'

createNextDescribe('x-forwarded-headers', { files: __dirname }, ({ next }) => {
  // In case you need to test the response object
  it('should include x-forwarded-proto and x-forwarded-host', async () => {
    const res = await next.fetch('/')
    const headers = await res.json()
    const url = new URL(next.url)
    expect(headers['x-forwarded-host']).toBe(url.host)
    expect(headers['x-forwarded-port']).toBe(url.port)
    expect(headers['x-forwarded-proto']).toBe(url.protocol.replace(':', ''))
  })
})
