/* eslint-env jest */
import { join } from 'path'
import webdriver from 'next-webdriver'
import { fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'

const itif = (condition: boolean) => (condition ? it : it.skip)

const isModeDeploy = process.env.NEXT_TEST_MODE === 'deploy'

describe('Middleware custom matchers', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy && process.env.TEST_NODE_MIDDLEWARE) {
    return it('should skip deploy for now', () => {})
  }

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, '../app')),
      overrideFiles: process.env.TEST_NODE_MIDDLEWARE
        ? {
            'middleware.js': new FileRef(
              join(__dirname, '../app/middleware-node.js')
            ),
          }
        : {},
    })
  })
  afterAll(() => next.destroy())

  const runTests = () => {
    it('should match missing header correctly', async () => {
      const res = await fetchViaHTTP(next.url, '/missing-match-1')
      expect(res.headers.get('x-from-middleware')).toBeDefined()

      const res2 = await fetchViaHTTP(next.url, '/missing-match-1', undefined, {
        headers: {
          hello: 'world',
        },
      })
      expect(res2.headers.get('x-from-middleware')).toBeFalsy()

      const res3 = await fetchViaHTTP(next.url, '/')
      expect(res3.headers.get('x-from-middleware')).toBeDefined()

      const res4 = await fetchViaHTTP(next.url, '/', undefined, {
        headers: {
          purpose: 'prefetch',
        },
      })
      expect(res4.headers.get('x-from-middleware')).toBeFalsy()
    })

    it('should match missing query correctly', async () => {
      const res = await fetchViaHTTP(next.url, '/missing-match-2')
      expect(res.headers.get('x-from-middleware')).toBeDefined()

      const res2 = await fetchViaHTTP(next.url, '/missing-match-2', {
        test: 'value',
      })
      expect(res2.headers.get('x-from-middleware')).toBeFalsy()
    })

    it('should match source path', async () => {
      const res = await fetchViaHTTP(next.url, '/source-match')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBeDefined()
    })

    it('should match has header', async () => {
      const res = await fetchViaHTTP(next.url, '/has-match-1', undefined, {
        headers: {
          'x-my-header': 'hello world!!',
        },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBeDefined()

      const res2 = await fetchViaHTTP(next.url, '/has-match-1')
      expect(res2.status).toBe(404)
    })

    it('should match has query', async () => {
      const res = await fetchViaHTTP(next.url, '/has-match-2', {
        'my-query': 'hellooo',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBeDefined()

      const res2 = await fetchViaHTTP(next.url, '/has-match-2')
      expect(res2.status).toBe(404)
    })

    it('should match has cookie', async () => {
      const res = await fetchViaHTTP(next.url, '/has-match-3', undefined, {
        headers: {
          cookie: 'loggedIn=true',
        },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBeDefined()

      const res2 = await fetchViaHTTP(next.url, '/has-match-3', undefined, {
        headers: {
          cookie: 'loggedIn=false',
        },
      })
      expect(res2.status).toBe(404)
    })

    // Cannot modify host when testing with real deployment
    itif(!isModeDeploy)('should match has host', async () => {
      const res1 = await fetchViaHTTP(next.url, '/has-match-4')
      expect(res1.status).toBe(404)

      const res = await fetchViaHTTP(next.url, '/has-match-4', undefined, {
        headers: {
          host: 'example.com',
        },
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBeDefined()

      const res2 = await fetchViaHTTP(next.url, '/has-match-4', undefined, {
        headers: {
          host: 'example.org',
        },
      })
      expect(res2.status).toBe(404)
    })

    it('should match has header value', async () => {
      const res = await fetchViaHTTP(next.url, '/has-match-5', undefined, {
        headers: {
          hasParam: 'with-params',
        },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBeDefined()

      const res2 = await fetchViaHTTP(next.url, '/has-match-5', undefined, {
        headers: {
          hasParam: 'without-params',
        },
      })
      expect(res2.status).toBe(404)
    })

    // FIXME: Test fails on Vercel deployment for now.
    // See https://linear.app/vercel/issue/EC-160/header-value-set-on-middleware-is-not-propagated-on-client-request-of
    itif(!isModeDeploy)(
      'should match has query on client routing',
      async () => {
        const browser = await webdriver(next.url, '/routes')
        await browser.eval('window.__TEST_NO_RELOAD = true')
        await browser.elementById('has-match-2').click()
        const fromMiddleware = await browser
          .elementById('from-middleware')
          .text()
        expect(fromMiddleware).toBe('true')
        const noReload = await browser.eval('window.__TEST_NO_RELOAD')
        expect(noReload).toBe(true)
      }
    )

    itif(!isModeDeploy)(
      'should match has cookie on client routing',
      async () => {
        const browser = await webdriver(next.url, '/routes')
        await browser.addCookie({ name: 'loggedIn', value: 'true' })
        await browser.refresh()
        await browser.eval('window.__TEST_NO_RELOAD = true')
        await browser.elementById('has-match-3').click()
        const fromMiddleware = await browser
          .elementById('from-middleware')
          .text()
        expect(fromMiddleware).toBe('true')
        const noReload = await browser.eval('window.__TEST_NO_RELOAD')
        expect(noReload).toBe(true)
      }
    )
  }
  runTests()
})
