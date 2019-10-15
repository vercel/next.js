/* global test */
import 'testcafe'
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import { waitFor, check } from 'next-test-utils'

// These tests are similar to ../../basic/test/dynamic.js
export default render => {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }
  test('should render dynamic import components', async t => {
    const $ = await get$('/dynamic/ssr')
    await t.expect($('body').text()).match(/Hello World 1/)
  })

  test('should render even there are no physical chunk exists', async t => {
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/dynamic/no-chunk')
      await check(() => browser.elementByCss('body').text(), /Welcome, normal/)
      await check(() => browser.elementByCss('body').text(), /Welcome, dynamic/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should not render loading on the server side', async t => {
    const $ = await get$('/dynamic/no-ssr')
    await t.expect($('body').text()).notContains('loading...')
  })

  test('should render the component on client side', async t => {
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/dynamic/no-ssr')
      await check(() => browser.elementByCss('body').text(), /Hello World 1/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should render the component on the server side', async t => {
    const $ = await get$('/dynamic/ssr-true')
    await t.expect($('p').text()).eql('Hello World 1')
  })

  test('should render the component on client side', async t => {
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/dynamic/ssr-true')
      await check(() => browser.elementByCss('body').text(), /Hello World 1/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should render custom loading on the server side when `ssr:false` and `loading` is provided', async t => {
    const $ = await get$('/dynamic/no-ssr-custom-loading')
    await t.expect($('p').text()).eql('LOADING')
  })

  test('should render the component on client side', async t => {
    let browser
    try {
      browser = await webdriver(
        t.fixtureCtx.appPort,
        '/dynamic/no-ssr-custom-loading'
      )
      await check(() => browser.elementByCss('body').text(), /Hello World 1/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should render dynamic imports bundle', async t => {
    const $ = await get$('/dynamic/bundle')
    const bodyText = $('body').text()
    await t.expect(/Dynamic Bundle/.test(bodyText)).eql(true)
    await t.expect(/Hello World 1/.test(bodyText)).eql(true)
    await t.expect(/Hello World 2/.test(bodyText)).eql(false)
  })

  test('should render dynamic imports bundle with additional components', async t => {
    const $ = await get$('/dynamic/bundle?showMore=1')
    const bodyText = $('body').text()
    await t.expect(/Dynamic Bundle/.test(bodyText)).eql(true)
    await t.expect(/Hello World 1/.test(bodyText)).eql(true)
    await t.expect(/Hello World 2/.test(bodyText)).eql(true)
  })

  test('should render components', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/dynamic/bundle')

    while (true) {
      const bodyText = await browser.elementByCss('body').text()
      if (
        /Dynamic Bundle/.test(bodyText) &&
        /Hello World 1/.test(bodyText) &&
        !/Hello World 2/.test(bodyText)
      ) {
        break
      }
      await waitFor(1000)
    }

    await browser.close()
  })

  test('should render support React context', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/dynamic/bundle')

    while (true) {
      const bodyText = await browser.elementByCss('body').text()
      if (/ZEIT Rocks/.test(bodyText)) break
      await waitFor(1000)
    }

    await browser.close()
  })

  test('should load new components and render for prop changes', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/dynamic/bundle')

    await browser.waitForElementByCss('#toggle-show-more')
    await browser.elementByCss('#toggle-show-more').click()

    while (true) {
      const bodyText = await browser.elementByCss('body').text()
      if (
        /Dynamic Bundle/.test(bodyText) &&
        /Hello World 1/.test(bodyText) &&
        /Hello World 2/.test(bodyText)
      ) {
        break
      }
      await waitFor(1000)
    }

    await browser.close()
  })
}
