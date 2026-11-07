/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Edge Runtime and the `revalidate` segment config are not supported with Cache
// Components.
// @force-gate !cacheComponents
describe('proxy cookies in edge and cached route handlers', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('lets an edge route handler read the proxy cookie', async () => {
    const res = await next.fetch('/edge', { headers: { cookie: 'session=1' } })

    expect(res.status).toBe(200)
    expect((await res.json()).cookies).toBe('session=1,from-proxy=fast')
  })

  it('does not emit a second Set-Cookie for a proxy cookie with maxAge', async () => {
    const res = await next.fetch('/secure-edge')

    expect(res.status).toBe(200)
    expect((await res.json()).session).toBe('secret')
    expect(
      res.headers
        .getSetCookie()
        .filter((cookie) => cookie.startsWith('session='))
    ).toHaveLength(1)
  })

  // Route handlers read the mutable cookies on every response, so a proxy cookie
  // recorded as modified would be cached with this response.
  it('does not cache a proxy cookie with the route handler response', async () => {
    const first = await next.fetch('/cached', {
      headers: { 'x-user': 'first' },
    })
    const { time } = await first.json()

    // Wait until a request with a proxy cookie has regenerated the response.
    await retry(async () => {
      const res = await next.fetch('/cached', {
        headers: { 'x-user': 'second' },
      })
      expect((await res.json()).time).not.toBe(time)
    }, 10_000)

    const third = await next.fetch('/cached', {
      headers: { 'x-user': 'third' },
    })
    expect(
      third.headers
        .getSetCookie()
        .filter((cookie) => cookie.startsWith('user='))
    ).toEqual(['user=third; Path=/'])
  })
})
