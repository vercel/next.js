/* eslint-env jest */
import path from 'path'
import cheerio from 'cheerio'
import { check, retry, withQuery } from 'next-test-utils'
import { nextTestSetup, FileRef } from 'e2e-utils'
import type { Response } from 'node-fetch'

describe('app-dir with middleware', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should filter correctly after middleware rewrite', async () => {
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
        'x-from-middleware': 'hello-from-middleware',
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
        'x-from-middleware': 'hello-from-middleware',
      })

      // Should not be included in response headers.
      expect(res.headers.get('x-middleware-override-headers')).toBeNull()
      expect(
        res.headers.get('x-middleware-request-x-from-middleware')
      ).toBeNull()
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
        'x-from-middleware': 'hello-from-middleware',
      })

      // Should not be included in response headers.
      expect(res.headers.get('x-middleware-override-headers')).toBeNull()
      expect(
        res.headers.get('x-middleware-request-x-from-middleware')
      ).toBeNull()
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

  it('retains a link response header from the middleware', async () => {
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

    // cookies were set in middleware, assert they are present and match the Math.random() pattern
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

  it('should respect cookie options of merged middleware cookies', async () => {
    const browser = await next.browser('/rsc-cookies/cookie-options')

    const totalCookies = await browser.elementById('total-cookies').text()

    // a secure cookie was set in middleware
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

  it('should omit internal headers for middleware cookies', async () => {
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

  it('should be possible to read cookies that are set during the middleware handling of a server action', async () => {
    const browser = await next.browser('/rsc-cookies')
    const initialRandom1 = await browser.elementById('rsc-cookie-1').text()
    const initialRandom2 = await browser.elementById('rsc-cookie-2').text()
    const totalCookies = await browser.elementById('total-cookies').text()

    // cookies were set in middleware, assert they are present and match the Math.random() pattern
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
})

describe('app dir - middleware without pages dir', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(path.join(__dirname, 'app')),
      'next.config.js': new FileRef(path.join(__dirname, 'next.config.js')),
      'middleware.js': `
      import { NextResponse } from 'next/server'

      export async function middleware(request) {
        return new NextResponse('redirected')
      }

      export const config = {
        matcher: '/headers'
      }
    `,
    },
  })

  // eslint-disable-next-line jest/no-identical-title
  it('Updates headers', async () => {
    const html = await next.render('/headers')

    expect(html).toContain('redirected')
  })
})

describe('app dir - middleware with middleware in src dir', () => {
  const { next } = nextTestSetup({
    files: {
      'src/app': new FileRef(path.join(__dirname, 'app')),
      'next.config.js': new FileRef(path.join(__dirname, 'next.config.js')),
      'src/middleware.js': `
      import { NextResponse } from 'next/server'
      import { cookies } from 'next/headers'

      export async function middleware(request) {
        const cookie = (await cookies()).get('test-cookie')
        return NextResponse.json({ cookie })
      }
    `,
    },
  })

  it('works without crashing when using RequestStore', async () => {
    const browser = await next.browser('/')
    await browser.addCookie({
      name: 'test-cookie',
      value: 'test-cookie-response',
    })
    await browser.refresh()

    const html = await browser.eval('document.documentElement.innerHTML')

    expect(html).toContain('test-cookie-response')
  })
})
