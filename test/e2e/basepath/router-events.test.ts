import assert from 'assert'
import webdriver from 'next-webdriver'
import { nextTestSetup } from 'e2e-utils'
import { check, retry } from 'next-test-utils'

describe('basePath', () => {
  const basePath = '/docs'

  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      basePath,
      onDemandEntries: {
        // Make sure entries are not getting disposed.
        maxInactiveAge: 1000 * 60 * 60,
      },
    },
  })

  it('should use urls with basepath in router events', async () => {
    const browser = await webdriver(next.url, `${basePath}/hello`)
    try {
      await check(
        () => browser.eval('window.next.router.isReady ? "ready" : "no"'),
        'ready'
      )
      await browser.eval('window._clearEventLog()')
      await browser
        .elementByCss('#other-page-link')
        .click()
        .waitForElementByCss('#other-page-title')

      const eventLog = await browser.eval('window._getEventLog()')
      expect(
        eventLog.filter((item) => item[1]?.endsWith('/other-page'))
      ).toEqual([
        ['routeChangeStart', `${basePath}/other-page`, { shallow: false }],
        ['beforeHistoryChange', `${basePath}/other-page`, { shallow: false }],
        ['routeChangeComplete', `${basePath}/other-page`, { shallow: false }],
      ])
    } finally {
      await browser.close()
    }
  })

  it('should use urls with basepath in router events for hash changes', async () => {
    const browser = await webdriver(next.url, `${basePath}/hello`)
    try {
      await check(
        () => browser.eval('window.next.router.isReady ? "ready" : "no"'),
        'ready'
      )
      await browser.eval('window._clearEventLog()')
      await browser.elementByCss('#hash-change').click()

      const eventLog = await browser.eval('window._getEventLog()')
      expect(eventLog).toEqual([
        ['hashChangeStart', `${basePath}/hello#some-hash`, { shallow: false }],
        [
          'hashChangeComplete',
          `${basePath}/hello#some-hash`,
          { shallow: false },
        ],
      ])
    } finally {
      await browser.close()
    }
  })

  it('should use urls with basepath in router events for cancelled routes', async () => {
    const browser = await webdriver(next.url, `${basePath}/hello`)
    try {
      await check(
        () => browser.eval('window.next.router.isReady ? "ready" : "no"'),
        'ready'
      )
      await browser.eval('window._clearEventLog()')

      await browser
        .elementByCss('#slow-route')
        .click()
        .elementByCss('#other-page-link')
        .click()
        .waitForElementByCss('#other-page-title')

      const eventLog = await browser.eval('window._getEventLog()')
      expect(eventLog).toEqual([
        ['routeChangeStart', `${basePath}/slow-route`, { shallow: false }],
        [
          'routeChangeError',
          'Route Cancelled',
          true,
          `${basePath}/slow-route`,
          { shallow: false },
        ],
        ['routeChangeStart', `${basePath}/other-page`, { shallow: false }],
        ['beforeHistoryChange', `${basePath}/other-page`, { shallow: false }],
        ['routeChangeComplete', `${basePath}/other-page`, { shallow: false }],
      ])
    } finally {
      await browser.close()
    }
  })

  it('should use urls with basepath in router events for failed route change', async () => {
    const browser = await webdriver(next.url, `${basePath}/hello`)
    try {
      await check(
        () => browser.eval('window.next.router.isReady ? "ready" : "no"'),
        'ready'
      )
      await browser.eval('window._clearEventLog()')
      await browser.elementByCss('#error-route').click()

      await retry(async () => {
        const eventLog = await browser.eval('window._getEventLog()')
        assert.deepEqual(eventLog, [
          ['routeChangeStart', `${basePath}/error-route`, { shallow: false }],
          [
            'routeChangeError',
            'Failed to load static props',
            null,
            `${basePath}/error-route`,
            { shallow: false },
          ],
        ])
      }, 10_000)
    } finally {
      await browser.close()
    }
  })
})
