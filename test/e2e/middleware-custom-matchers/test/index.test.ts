/* eslint-env jest */
import { join } from 'path'
import webdriver from 'next-webdriver'
import { fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('Middleware custom matchers', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, '../app')),
    })
  })
  afterAll(() => next.destroy())

  const runTests = () => {
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

    it('should match has host', async () => {
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

    it('should match has query on client routing', async () => {
      const browser = await webdriver(next.url, '/routes')
      await browser.elementById('has-match-2').click()
      const fromMiddleware = await browser.elementById('from-middleware').text()
      expect(fromMiddleware).toBe('true')
    })

    it('should match has cookie on client routing', async () => {
      const browser = await webdriver(next.url, '/routes')
      await browser.eval("document.cookie = 'loggedIn=true;'")
      await browser.elementById('has-match-3').click()
      const fromMiddleware = await browser.elementById('from-middleware').text()
      expect(fromMiddleware).toBe('true')
    })
  }
  runTests()
})
