/* eslint-env jest */

import { join } from 'path'
import { fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('Middleware custom matchers basePath', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, '../app')),
    })
  })
  afterAll(() => next.destroy())

  it('should match', async () => {
    for (const path of ['/docs/hello', '/docs/about']) {
      const res = await fetchViaHTTP(next.url, path)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBeDefined()
    }
  })

  it('should not match', async () => {
    for (const path of ['/hello', '/about', '/invalid/docs/hello']) {
      const res = await fetchViaHTTP(next.url, path)
      expect(res.status).toBe(404)
    }
  })

  // This test is failing because of https://github.com/vercel/next.js/issues/39428.
  /*
  it('should match has query on client routing', async () => {
    for (const id of ['hello', 'about']) {
      const browser = await webdriver(next.url, '/docs/routes')
      await browser.eval('window.__TEST_NO_RELOAD = true')
      await browser.elementById(id).click()
      const fromMiddleware = await browser.elementById('from-middleware').text()
      expect(fromMiddleware).toBe('true')
      const noReload = await browser.eval('window.__TEST_NO_RELOAD')
      expect(noReload).toBe(true)
    }
  })
  */
})
