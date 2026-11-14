/* eslint-env jest */

import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('proxy cookies in route handlers', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  async function pageCookies(
    pathname: string,
    headers?: Record<string, string>
  ) {
    const res = await next.fetch(pathname, { headers })
    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())
    return $('#cookies').text()
  }

  async function routeResult(
    pathname: string,
    headers?: Record<string, string>
  ) {
    const res = await next.fetch(pathname, { headers })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-set-cookie')).toBeNull()
    return {
      cookies: (await res.json()).cookies as string,
      setCookie: res.headers.getSetCookie(),
    }
  }

  function setCookiesFor(setCookie: string[], name: string) {
    return setCookie.filter((cookie) => cookie.startsWith(name + '='))
  }

  it('lets a route handler read the proxy cookie from the same request', async () => {
    const headers = { cookie: 'session=1' }
    const page = await pageCookies('/', headers)
    const route = await routeResult('/api', headers)

    expect(page).toBe('session=1,from-proxy=fast')
    expect(route.cookies).toBe(page)
    expect(setCookiesFor(route.setCookie, 'from-proxy')).toHaveLength(1)
  })

  it('applies a proxy override and hides the value of a deleted cookie', async () => {
    const headers = { cookie: 'session=1' }
    const override = await routeResult('/override/api', headers)

    expect(override.cookies).toBe(await pageCookies('/override', headers))
    expect(setCookiesFor(override.setCookie, 'session')).toHaveLength(1)

    const drop = await routeResult('/drop/api', headers)

    expect(drop.cookies).toContain('from-proxy=fast')
    expect(drop.cookies).not.toContain('session=1')
    expect(setCookiesFor(drop.setCookie, 'session')).toHaveLength(1)
  })

  it('reads a proxy cookie value that contains a percent sign', async () => {
    const { cookies } = await routeResult('/percent/api')

    expect(cookies.split(',')).toContain('percent=100%')
    expect(cookies.split(',')).toContain('from-proxy=fast')
  })

  it('does not emit a second Set-Cookie for a proxy cookie with maxAge', async () => {
    const headers = { cookie: 'session=1' }
    const route = await routeResult('/secure/api', headers)

    expect(route.cookies).toContain('session=secret')
    expect(setCookiesFor(route.setCookie, 'session')).toHaveLength(1)

    const redirect = await next.fetch('/secure/redirect', {
      headers,
      redirect: 'manual',
    })

    expect(redirect.status).toBe(307)
    expect(
      setCookiesFor(redirect.headers.getSetCookie(), 'session')
    ).toHaveLength(1)
  })

  it('keeps the proxy cookie when the route handler sets another cookie', async () => {
    const result = await routeResult('/write', { cookie: 'session=1' })

    expect(result.cookies).toBe('session=1,from-proxy=fast,from-route=yes')
    expect(setCookiesFor(result.setCookie, 'from-proxy')).toHaveLength(1)
    expect(setCookiesFor(result.setCookie, 'from-route')).toHaveLength(1)
  })

  it('ignores x-middleware-set-cookie sent by the client', async () => {
    const { cookies } = await routeResult('/forged', {
      cookie: 'session=1',
      'x-middleware-set-cookie': 'forged=1',
    })

    expect(cookies).toBe('session=1')
  })

  it('lets after() read the proxy cookie in a route handler', async () => {
    const res = await next.fetch('/after', {
      headers: { cookie: 'session=1' },
    })
    expect(res.status).toBe(200)

    // `cliOutput` has only the build logs when deployed.
    if (!isNextDeploy) {
      await retry(() => {
        expect(next.cliOutput).toContain(
          'cookies in after: session=1,from-proxy=fast'
        )
      })
    }
  })
})
