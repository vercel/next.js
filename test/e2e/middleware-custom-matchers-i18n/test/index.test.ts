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
