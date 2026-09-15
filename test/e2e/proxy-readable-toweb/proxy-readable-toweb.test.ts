import { nextTestSetup } from 'e2e-utils'

describe('proxy request body with Readable.toWeb', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('allows a pages api route to read the proxied body with Readable.toWeb()', async () => {
    const body = JSON.stringify({ hello: 'world' })

    const res = await next.fetch('/api/echo', {
      body,
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({
      echo: { hello: 'world' },
      writableState: false,
      write: 'undefined',
      end: 'undefined',
    })
  })

  it('still allows a pages api route to read the proxied body with node events', async () => {
    const body = JSON.stringify({ hello: 'world' })

    const res = await next.fetch('/api/echo-events', {
      body,
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({
      echo: { hello: 'world' },
    })
  })
})
