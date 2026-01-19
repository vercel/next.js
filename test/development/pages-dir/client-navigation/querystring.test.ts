/* eslint-env jest */

import { check } from 'next-test-utils'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Client navigation querystring', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })

  describe('with the same page but different querystring', () => {
    it('should navigate the page', async () => {
      const browser = await next.browser('/nav/querystring?id=1')
      const text = await browser
        .elementByCss('#next-id-link')
        .click()
        .waitForElementByCss('.nav-id-2')
        .elementByCss('p')
        .text()

      expect(text).toBe('2')
      await browser.close()
    })

    it('should remove querystring', async () => {
      const browser = await next.browser('/nav/querystring?id=1')
      const text = await browser
        .elementByCss('#main-page')
        .click()
        .waitForElementByCss('.nav-id-0')
        .elementByCss('p')
        .text()

      expect(text).toBe('0')
      await browser.close()
    })
  })

  describe('with querystring relative urls', () => {
    it('should work with Link', async () => {
      const browser = await next.browser('/nav/query-only')
      await browser.elementByCss('#link').click()

      await check(() => browser.waitForElementByCss('#prop').text(), 'foo')
    })

    it('should work with router.push', async () => {
      const browser = await next.browser('/nav/query-only')
      await browser.elementByCss('#router-push').click()

      await check(() => browser.waitForElementByCss('#prop').text(), 'bar')
    })

    it('should work with router.replace', async () => {
      const browser = await next.browser('/nav/query-only')
      await browser.elementByCss('#router-replace').click()

      await check(() => browser.waitForElementByCss('#prop').text(), 'baz')
    })

    it('router.replace with shallow=true shall not throw route cancelled errors', async () => {
      const browser = await next.browser('/nav/query-only-shallow')
      await browser.elementByCss('#router-replace').click()
      // the error occurs on every replace() after the first one
      await browser.elementByCss('#router-replace').click()

      await check(
        () => browser.waitForElementByCss('#routeState').text(),
        '{"completed":2,"errors":0}'
      )
    })
  })
})
