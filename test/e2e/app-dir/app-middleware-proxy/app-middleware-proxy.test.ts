/* eslint-env jest */
import cheerio from 'cheerio'
import { check, retry, withQuery } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'
import type { Response } from 'node-fetch'

describe('app-dir with proxy', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('should log compilation time', async () => {
      await next.browser('/')
      expect(next.cliOutput).toMatch(
        /GET \/ 200 in .* \(compile:.*, proxy.ts:.*, render:.*\)/
      )
    })
  }

  it('should filter correctly after proxy rewrite', async () => {
    const browser = await next.browser('/start')

    await browser.eval('window.beforeNav = 1')
    await browser.eval('window.next.router.push("/rewrite-to-app")')

    await check(async () => {
      return browser.eval('document.documentElement.innerHTML')
    }, /app-dir/)
  })

  describe.each([
    {
      title: 'Serverless Functions',
      path: '/api/dump-headers-serverless',
      toJson: (res: Response) => res.json(),
    },
    {
      title: 'Edge Functions',
      path: '/api/dump-headers-edge',
      toJson: (res: Response) => res.json(),
    },
    {
      title: 'next/headers',
      path: '/headers',
      toJson: async (res: Response) => {
        const $ = cheerio.load(await res.text())
        return JSON.parse($('#headers').text())
      },
    },
  ])('Mutate request headers for $title', ({ path, toJson }) => {
    it(`Adds new headers`, async () => {
      const res = await next.fetch(path, {
        headers: {
          'x-from-client': 'hello-from-client',
        },
      })
      expect(await toJson(res)).toMatchObject({
        'x-from-client': 'hello-from-client',
        'x-from-proxy': 'hello-from-proxy',
      })
    })

    it(`Deletes headers`, async () => {
      const res = await next.fetch(
        withQuery(path, {
          'remove-headers': 'x-from-client1,x-from-client2',
        }),
        {
          headers: {
            'x-from-client1': 'hello-from-client',
            'X-From-Client2': 'hello-from-client',
          },
        }
      )

      const json = await toJson(res)
      expect(json).not.toHaveProperty('x-from-client1')
      expect(json).not.toHaveProperty('X-From-Client2')
      expect(json).toMatchObject({
        'x-from-proxy': 'hello-from-proxy',
      })

      // Should not be included in response headers.
      expect(res.headers.get('x-middleware-override-headers')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-from-proxy')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-from-client1')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-from-client2')).toBeNull()
    })

    it(`Updates headers`, async () => {
      const res = await next.fetch(
        withQuery(path, {
          'update-headers':
            'x-from-client1=new-value1,x-from-client2=new-value2',
        }),
        {
          headers: {
            'x-from-client1': 'old-value1',
            'X-From-Client2': 'old-value2',
            'x-from-client3': 'old-value3',
          },
        }
      )
      expect(await toJson(res)).toMatchObject({
        'x-from-client1': 'new-value1',
        'x-from-client2': 'new-value2',
        'x-from-client3': 'old-value3',
        'x-from-proxy': 'hello-from-proxy',
      })

      // Should not be included in response headers.
      expect(res.headers.get('x-middleware-override-headers')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-from-proxy')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-from-client1')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-from-client2')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-from-client3')).toBeNull()
    })

    it(`Supports draft mode`, async () => {
      const res = await next.fetch(`${path}?draft=true`)
      const headers: string = res.headers.get('set-cookie') || ''
      const bypassCookie = headers
        .split(';')
        .find((c) => c.startsWith('__prerender_bypass'))
      expect(bypassCookie).toBeDefined()
    })
  })

  it('retains a link response header from the proxy', async () => {
    const res = await next.fetch('/preloads')
    expect(res.headers.get('link')).toContain(
      '<https://example.com/page>; rel="alternate"; hreflang="en"'
    )
  })

  it('should be possible to modify cookies & read them in an RSC in a single request', async () => {
    const browser = await next.browser('/rsc-cookies')

    const initialRandom1 = await browser.elementById('rsc-cookie-1').text()
    const initialRandom2 = await browser.elementById('rsc-cookie-2').text()
    const totalCookies = await browser.elementById('total-cookies').text()

    // cookies were set in proxy, assert they are present and match the Math.random() pattern
    expect(initialRandom1).toMatch(/Cookie 1: \d+\.\d+/)
    expect(initialRandom2).toMatch(/Cookie 2: \d+\.\d+/)
    expect(totalCookies).toBe('Total Cookie Length: 2')

    await browser.refresh()

    const refreshedRandom1 = await browser.elementById('rsc-cookie-1').text()
    const refreshedRandom2 = await browser.elementById('rsc-cookie-2').text()

    // the cookies should be refreshed and have new values
    expect(refreshedRandom1).toMatch(/Cookie 1: \d+\.\d+/)
    expect(refreshedRandom2).toMatch(/Cookie 2: \d+\.\d+/)
    expect(refreshedRandom1).not.toBe(initialRandom1)
    expect(refreshedRandom2).not.toBe(initialRandom2)

    // navigate to delete cookies route
    await browser.elementByCss('[href="/rsc-cookies-delete"]').click()
    await retry(async () => {
      // only the first cookie should be deleted
      expect(await browser.elementById('rsc-cookie-1').text()).toBe('Cookie 1:')

      expect(await browser.elementById('rsc-cookie-2').text()).toMatch(
        /Cookie 2: \d+\.\d+/
      )
    })

    // Cleanup
    await browser.deleteCookies()
  })

  it('should respect cookie options of merged proxy cookies', async () => {
    const browser = await next.browser('/rsc-cookies/cookie-options')

    const totalCookies = await browser.elementById('total-cookies').text()

    // a secure cookie was set in proxy
    expect(totalCookies).toBe('Total Cookie Length: 1')

    // we don't expect to be able to read it
    expect(await browser.eval('document.cookie')).toBeFalsy()

    await browser.elementById('submit-server-action').click()

    await retry(async () => {
      expect(await browser.elementById('action-result').text()).toMatch(
        /Action Result: \d+\.\d+/
      )
    })

    // ensure that we still can't read the secure cookie
    expect(await browser.eval('document.cookie')).toBeFalsy()

    // Cleanup
    await browser.deleteCookies()
  })

  it('should omit internal headers for proxy cookies', async () => {
    const response = await next.fetch('/rsc-cookies/cookie-options')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-set-cookie')).toBeNull()

    const response2 = await next.fetch('/cookies/api')
    expect(response2.status).toBe(200)
    expect(response2.headers.get('x-middleware-set-cookie')).toBeNull()
    expect(response2.headers.get('set-cookie')).toBeDefined()
    expect(response2.headers.get('set-cookie')).toContain('example')
  })

  it('should ignore x-middleware-set-cookie as a request header', async () => {
    const $ = await next.render$(
      '/cookies',
      {},
      {
        headers: {
          'x-middleware-set-cookie': 'test',
        },
      }
    )

    expect($('#cookies').text()).toBe('cookies: 0')
  })

  it('should be possible to read cookies that are set during the proxy handling of a server action', async () => {
    const browser = await next.browser('/rsc-cookies')
    const initialRandom1 = await browser.elementById('rsc-cookie-1').text()
    const initialRandom2 = await browser.elementById('rsc-cookie-2').text()
    const totalCookies = await browser.elementById('total-cookies').text()

    // cookies were set in proxy, assert they are present and match the Math.random() pattern
    expect(initialRandom1).toMatch(/Cookie 1: \d+\.\d+/)
    expect(initialRandom2).toMatch(/Cookie 2: \d+\.\d+/)
    expect(totalCookies).toBe('Total Cookie Length: 2')

    expect(await browser.eval('document.cookie')).toBeTruthy()

    await browser.deleteCookies()

    // assert that document.cookie is empty
    expect(await browser.eval('document.cookie')).toBeFalsy()

    await browser.elementById('submit-server-action').click()

    await retry(async () => {
      expect(await browser.elementById('action-result').text()).toMatch(
        /Action Result: \d+\.\d+/
      )
    })

    await browser.deleteCookies()
  })

  // TODO: This consistently 404s on Vercel deployments. It technically
  // doesn't repro the bug we're trying to fix but we need to figure out
  // why the handling is different.
  if (!isNextDeploy) {
    it('should not incorrectly treat a Location header as a rewrite', async () => {
      const res = await next.fetch('/test-location-header')

      // Should get status 200 (not a redirect status)
      expect(res.status).toBe(200)

      // Should get the JSON response associated with the route,
      // and not follow the redirect
      const json = await res.json()
      expect(json).toEqual({ foo: 'bar' })

      // Ensure the provided location is still on the response
      const locationHeader = res.headers.get('location')
      expect(locationHeader).toBe(
        'https://next-data-api-endpoint.vercel.app/api/random'
      )
    })
  }
})
