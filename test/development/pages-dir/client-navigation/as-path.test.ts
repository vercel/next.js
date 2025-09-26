/* eslint-env jest */

import { check } from 'next-test-utils'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Client navigation with asPath', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })

  describe('inside getInitialProps', () => {
    it('should show the correct asPath with a Link with as prop', async () => {
      const browser = await next.browser('/nav')
      const asPath = await browser
        .elementByCss('#as-path-link')
        .click()
        .waitForElementByCss('.as-path-content')
        .elementByCss('.as-path-content')
        .text()

      expect(asPath).toBe('/as/path')
      await browser.close()
    })

    it('should show the correct asPath with a Link without the as prop', async () => {
      const browser = await next.browser('/nav')
      const asPath = await browser
        .elementByCss('#as-path-link-no-as')
        .click()
        .waitForElementByCss('.as-path-content')
        .elementByCss('.as-path-content')
        .text()

      expect(asPath).toBe('/nav/as-path')
      await browser.close()
    })
  })

  describe('with next/router', () => {
    it('should show the correct asPath', async () => {
      const browser = await next.browser('/nav')
      const asPath = await browser
        .elementByCss('#as-path-using-router-link')
        .click()
        .waitForElementByCss('.as-path-content')
        .elementByCss('.as-path-content')
        .text()

      expect(asPath).toBe('/nav/as-path-using-router')
      await browser.close()
    })

    it('should navigate an absolute url on push', async () => {
      const browser = await next.browser(`/absolute-url?port=${next.appPort}`)
      await browser.waitForElementByCss('#router-push').click()
      await check(
        () => browser.eval(() => window.location.origin),
        'https://vercel.com'
      )
    })

    it('should navigate an absolute url on replace', async () => {
      const browser = await next.browser(`/absolute-url?port=${next.appPort}`)
      await browser.waitForElementByCss('#router-replace').click()
      await check(
        () => browser.eval(() => window.location.origin),
        'https://vercel.com'
      )
    })

    it('should navigate an absolute local url on push', async () => {
      const browser = await next.browser(`/absolute-url?port=${next.appPort}`)
      // @ts-expect-error _didNotNavigate is set intentionally
      await browser.eval(() => (window._didNotNavigate = true))
      await browser.waitForElementByCss('#router-local-push').click()
      const text = await browser
        .waitForElementByCss('.nav-about')
        .elementByCss('p')
        .text()
      expect(text).toBe('This is the about page.')
      // @ts-expect-error _didNotNavigate is set intentionally
      expect(await browser.eval(() => window._didNotNavigate)).toBe(true)
    })

    it('should navigate an absolute local url on replace', async () => {
      const browser = await next.browser(`/absolute-url?port=${next.appPort}`)
      // @ts-expect-error _didNotNavigate is set intentionally
      await browser.eval(() => (window._didNotNavigate = true))
      await browser.waitForElementByCss('#router-local-replace').click()
      const text = await browser
        .waitForElementByCss('.nav-about')
        .elementByCss('p')
        .text()
      expect(text).toBe('This is the about page.')
      // @ts-expect-error _didNotNavigate is set intentionally
      expect(await browser.eval(() => window._didNotNavigate)).toBe(true)
    })
  })

  describe('with next/link', () => {
    it('should use pushState with same href and different asPath', async () => {
      const browser = await next.browser('/nav/as-path-pushstate')
      await browser
        .elementByCss('#hello')
        .click()
        .waitForElementByCss('#something-hello')
      const queryOne = JSON.parse(
        await browser.elementByCss('#router-query').text()
      )
      expect(queryOne.something).toBe('hello')
      await browser
        .elementByCss('#same-query')
        .click()
        .waitForElementByCss('#something-same-query')
      const queryTwo = JSON.parse(
        await browser.elementByCss('#router-query').text()
      )
      expect(queryTwo.something).toBe('hello')
      await browser.back().waitForElementByCss('#something-hello')
      const queryThree = JSON.parse(
        await browser.elementByCss('#router-query').text()
      )
      expect(queryThree.something).toBe('hello')
      await browser
        .elementByCss('#else')
        .click()
        .waitForElementByCss('#something-else')
      await browser
        .elementByCss('#hello2')
        .click()
        .waitForElementByCss('#nav-as-path-pushstate')
      await browser.back().waitForElementByCss('#something-else')
      const queryFour = JSON.parse(
        await browser.elementByCss('#router-query').text()
      )
      expect(queryFour.something).toBe(undefined)
    })

    it('should detect asPath query changes correctly', async () => {
      const browser = await next.browser('/nav/as-path-query')
      await browser
        .elementByCss('#hello')
        .click()
        .waitForElementByCss('#something-hello-something-hello')
      const queryOne = JSON.parse(
        await browser.elementByCss('#router-query').text()
      )
      expect(queryOne.something).toBe('hello')
      await browser
        .elementByCss('#hello2')
        .click()
        .waitForElementByCss('#something-hello-something-else')
      const queryTwo = JSON.parse(
        await browser.elementByCss('#router-query').text()
      )
      expect(queryTwo.something).toBe('else')
    })
  })
})
