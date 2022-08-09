/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('Middleware custom matchers i18n', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, '../app')),
    })
  })
  afterAll(() => next.destroy())

  it('should match', async () => {
    for (const path of [
      '/hello',
      '/en/hello',
      '/nl-NL/hello',
      '/nl-NL/about',
    ]) {
      const res = await fetchViaHTTP(next.url, path)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBeDefined()
    }
  })

  it('should not match', async () => {
    for (const path of [
      '/invalid/hello',
      '/hello/invalid',
      '/about',
      '/en/about',
    ]) {
      const res = await fetchViaHTTP(next.url, path)
      expect(res.status).toBe(404)
    }
  })

  it('should match has query on client routing', async () => {
    for (const id of ['hello', 'en_hello', 'nl-NL_hello', 'nl-NL_about']) {
      const browser = await webdriver(next.url, '/routes')
      await browser.eval('window.__TEST_NO_RELOAD = true')
      await browser.elementById(id).click()
      const fromMiddleware = await browser.elementById('from-middleware').text()
      expect(fromMiddleware).toBe('true')
      const noReload = await browser.eval('window.__TEST_NO_RELOAD')
      expect(noReload).toBe(true)
    }
  })
})
