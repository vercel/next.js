/* eslint-env jest */
/* eslint-disable jest/no-standalone-expect */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

const itif = (condition: boolean) => (condition ? it : it.skip)

const isModeDeploy = process.env.NEXT_TEST_MODE === 'deploy'

describe('Middleware custom matchers i18n', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, '../app')),
    })
  })
  afterAll(() => next.destroy())

  it.each(['/hello', '/en/hello', '/nl-NL/hello', '/nl-NL/about'])(
    'should match',
    async (path) => {
      const res = await fetchViaHTTP(next.url, path)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBeDefined()
    }
  )

  it.each(['/invalid/hello', '/hello/invalid', '/about', '/en/about'])(
    'should not match',
    async (path) => {
      const res = await fetchViaHTTP(next.url, path)
      expect(res.status).toBe(404)
    }
  )

  // FIXME:
  // See https://linear.app/vercel/issue/EC-160/header-value-set-on-middleware-is-not-propagated-on-client-request-of
  itif(!isModeDeploy).each(['hello', 'en_hello', 'nl-NL_hello', 'nl-NL_about'])(
    'should match has query on client routing',
    async (id) => {
      const browser = await webdriver(next.url, '/routes')
      await browser.eval('window.__TEST_NO_RELOAD = true')
      await browser.elementById(id).click()
      const fromMiddleware = await browser.elementById('from-middleware').text()
      expect(fromMiddleware).toBe('true')
      const noReload = await browser.eval('window.__TEST_NO_RELOAD')
      expect(noReload).toBe(true)
    }
  )
})

describe('Middleware custom matchers with root', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, '../app', 'pages')),
        'next.config.js': new FileRef(
          join(__dirname, '../app', 'next.config.js')
        ),
        'middleware.js': `
        import { NextResponse } from 'next/server'
        
        export const config = {
          matcher: [
            '/',
            '/((?!api|_next/static|favicon|.well-known|auth|sitemap|robots.txt|files).*)',
          ],
        };
  
        export default function middleware(request) {
          const nextUrl = request.nextUrl.clone()
          nextUrl.pathname = '/'
          const res = NextResponse.rewrite(nextUrl)
          res.headers.set('X-From-Middleware', 'true')
          return res
        }`,
      },
    })
  })
  afterAll(() => next.destroy())

  it('should not match', async () => {
    const res = await fetchViaHTTP(
      next.url,
      `/_next/static/${next.buildId}/_buildManifest.js`
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('x-from-middleware')).toBeFalsy()
  })
})
