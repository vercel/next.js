/* eslint-env jest */

import { waitFor } from 'next-test-utils'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('updating <Head /> while client routing', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
  })

  it.each([true, false])(
    'should handle boolean async prop in next/head client-side: %s',
    async (bool) => {
      const browser = await next.browser('/head')
      const value = await browser.eval(
        `document.querySelector('script[src="/test-async-${JSON.stringify(
          bool
        )}.js"]').async`
      )

      expect(value).toBe(bool)
    }
  )

  it('should only execute async and defer scripts once', async () => {
    const browser = await next.browser('/head')

    await browser.waitForElementByCss('h1')
    await waitFor(2000)
    expect(Number(await browser.eval('window.__test_async_executions'))).toBe(1)
    expect(Number(await browser.eval('window.__test_defer_executions'))).toBe(1)

    await browser.elementByCss('#reverseScriptOrder').click()
    await waitFor(2000)

    expect(Number(await browser.eval('window.__test_async_executions'))).toBe(1)
    expect(Number(await browser.eval('window.__test_defer_executions'))).toBe(1)

    await browser.elementByCss('#toggleScript').click()
    await waitFor(2000)

    expect(Number(await browser.eval('window.__test_async_executions'))).toBe(1)
    expect(Number(await browser.eval('window.__test_defer_executions'))).toBe(1)
  })

  it('should warn when stylesheets or scripts are in head', async () => {
    const browser = await next.browser('/head')

    await browser.waitForElementByCss('h1')
    await waitFor(1000)
    const browserLogs = await browser.log()
    let foundStyles = false
    let foundScripts = false
    const logs = []
    browserLogs.forEach(({ message }) => {
      if (message.includes('Do not add stylesheets using next/head')) {
        foundStyles = true
        logs.push(message)
      }
      if (message.includes('Do not add <script> tags using next/head')) {
        foundScripts = true
        logs.push(message)
      }
    })

    expect(foundStyles).toEqual(true)
    expect(foundScripts).toEqual(true)

    // Warnings are unique
    expect(logs.length).toEqual(new Set(logs).size)
  })

  it('should warn when scripts are in head', async () => {
    const browser = await next.browser('/head')
    await browser.waitForElementByCss('h1')
    await waitFor(1000)
    const browserLogs = await browser.log()
    let found = false
    browserLogs.forEach((log) => {
      if (log.message.includes('Use next/script instead')) {
        found = true
      }
    })
    expect(found).toEqual(true)
  })

  it('should not warn when application/ld+json scripts are in head', async () => {
    const browser = await next.browser('/head-with-json-ld-snippet')
    await browser.waitForElementByCss('h1')
    await waitFor(1000)
    const browserLogs = await browser.log()
    let found = false
    browserLogs.forEach((log) => {
      if (log.message.includes('Use next/script instead')) {
        found = true
      }
    })
    expect(found).toEqual(false)
  })

  it('should update head during client routing', async () => {
    const browser = await next.browser('/nav/head-1')
    expect(
      await browser
        .elementByCss('meta[name="description"]')
        .getAttribute('content')
    ).toBe('Head One')

    await browser
      .elementByCss('#to-head-2')
      .click()
      .waitForElementByCss('#head-2', 3000)
    expect(
      await browser
        .elementByCss('meta[name="description"]')
        .getAttribute('content')
    ).toBe('Head Two')

    await browser
      .elementByCss('#to-head-1')
      .click()
      .waitForElementByCss('#head-1', 3000)
    expect(
      await browser
        .elementByCss('meta[name="description"]')
        .getAttribute('content')
    ).toBe('Head One')

    await browser
      .elementByCss('#to-head-3')
      .click()
      .waitForElementByCss('#head-3', 3000)
    expect(
      await browser
        .elementByCss('meta[name="description"]')
        .getAttribute('content')
    ).toBe('Head Three')
    expect(await browser.eval('document.title')).toBe('')

    await browser
      .elementByCss('#to-head-1')
      .click()
      .waitForElementByCss('#head-1', 3000)
    expect(
      await browser
        .elementByCss('meta[name="description"]')
        .getAttribute('content')
    ).toBe('Head One')
  })

  it('should update title during client routing', async () => {
    const browser = await next.browser('/nav/head-1')
    expect(await browser.eval('document.title')).toBe('this is head-1')

    await browser
      .elementByCss('#to-head-2')
      .click()
      .waitForElementByCss('#head-2', 3000)
    expect(await browser.eval('document.title')).toBe('this is head-2')

    await browser
      .elementByCss('#to-head-1')
      .click()
      .waitForElementByCss('#head-1', 3000)
    expect(await browser.eval('document.title')).toBe('this is head-1')
  })

  it('should update head when unmounting component', async () => {
    const browser = await next.browser('/head-dynamic')
    expect(await browser.eval('document.title')).toBe('B')
    await browser.elementByCss('button').click()
    expect(await browser.eval('document.title')).toBe('A')
    await browser.elementByCss('button').click()
    expect(await browser.eval('document.title')).toBe('B')
  })
})
