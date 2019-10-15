/* global test */
import 'testcafe'
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import { waitFor, check } from 'next-test-utils'

export default render => {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  test('should render dynamic import components', async t => {
    const $ = await get$('/dynamic/ssr')
    // Make sure the client side knows it has to wait for the bundle
    await t
      .expect($('body').html())
      .contains('"dynamicIds":["./components/hello1.js"]')
    await t.expect($('body').text()).match(/Hello World 1/)
  })

  test('should render dynamic import components using a function as first parameter', async t => {
    const $ = await get$('/dynamic/function')
    // Make sure the client side knows it has to wait for the bundle
    await t
      .expect($('body').html())
      .contains('"dynamicIds":["./components/hello1.js"]')
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

  test('should hydrate nested chunks', async t => {
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/dynamic/nested')
      await check(() => browser.elementByCss('body').text(), /Nested 1/)
      await check(() => browser.elementByCss('body').text(), /Nested 2/)
      await check(() => browser.elementByCss('body').text(), /Browser hydrated/)

      if (global.browserName === 'chrome') {
        const logs = await browser.log('browser')

        await Promise.all(
          logs.map(async logItem => {
            await t.expect(logItem).notMatch(/Expected server HTML to contain/)
          })
        )
      }
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should render the component Head content', async t => {
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/dynamic/head')
      await check(() => browser.elementByCss('body').text(), /test/)
      const backgroundColor = await browser
        .elementByCss('.dynamic-style')
        .getComputedCss('background-color')
      const height = await browser
        .elementByCss('.dynamic-style')
        .getComputedCss('height')
      await t.expect(height).eql('200px')
      await t.expect(backgroundColor).eql('rgb(0, 128, 0)')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should not render loading on the server side', async t => {
    const $ = await get$('/dynamic/no-ssr')
    await t.expect($('body').html()).notContains('"dynamicIds"')
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

  test('Should render the component on the server side', async t => {
    const $ = await get$('/dynamic/ssr-true')
    await t.expect($('body').html()).contains('"dynamicIds"')
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

  test('should render the correct filename', async t => {
    const $ = await get$('/dynamic/chunkfilename')
    await t.expect($('body').text()).match(/test chunkfilename/)
    await t.expect($('html').html()).match(/hello-world\.js/)
  })

  test('should render the component on client side', async t => {
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/dynamic/chunkfilename')
      await check(
        () => browser.elementByCss('body').text(),
        /test chunkfilename/
      )
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

  test('should only include the rendered module script tag', async t => {
    const $ = await get$('/dynamic/multiple-modules')
    const html = $('html').html()
    await t.expect(html).match(/hello1\.js/)
    await t.expect(html).notMatch(/hello2\.js/)
  })

  test('should only load the rendered module in the browser', async t => {
    let browser
    try {
      browser = await webdriver(
        t.fixtureCtx.appPort,
        '/dynamic/multiple-modules'
      )
      const html = await browser.elementByCss('html').getAttribute('innerHTML')
      await t.expect(html).match(/hello1\.js/)
      await t.expect(html).notMatch(/hello2\.js/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should only render one bundle if component is used multiple times', async t => {
    const $ = await get$('/dynamic/multiple-modules')
    const html = $('html').html()
    try {
      await t.expect(html.match(/chunks[\\/]hello1\.js/g).length).eql(2) // one for preload, one for the script tag
      await t.expect(html).notMatch(/hello2\.js/)
    } catch (err) {
      console.error(html)
      throw err
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
