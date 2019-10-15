/* global fixture,test */
import 'testcafe'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { validateAMP } from 'amp-test-utils'
import { accessSync, readFileSync, writeFileSync } from 'fs'
import {
  waitFor,
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  renderViaHTTP,
  check,
  getBrowserBodyText,
  findPort,
  launchApp,
  killApp,
  didThrow
} from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('AMP Usage')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    ctx.server = await startApp(ctx.app)
    ctx.appPort = ctx.server.address().port
  })
  .after(ctx => stopApp(ctx.server))

test('should render the page', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/')
  await t.expect(html).match(/Hello World/)
})

test('should render the page as valid AMP', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/?amp=1')
  await validateAMP(html)
  await t.expect(html).match(/Hello World/)

  const $ = cheerio.load(html)
  await t.expect($('.abc').length === 1).ok()
})

test('should not output client pages for AMP only', async t => {
  const buildId = readFileSync(join(appDir, '.next/BUILD_ID'), 'utf8')
  const ampOnly = ['only-amp', 'root-hmr']
  for (const pg of ampOnly) {
    didThrow(() =>
      accessSync(join(appDir, '.next/static', buildId, 'pages', pg + '.js'))
    )
    didThrow(
      () =>
        accessSync(
          join(appDir, '.next/server/static', buildId, 'pages', pg + '.html')
        ),
      false
    )
    didThrow(() =>
      accessSync(
        join(appDir, '.next/server/static', buildId, 'pages', pg + '.js')
      )
    )
  }
})

test('should add link preload for amp script', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/?amp=1')
  await validateAMP(html)
  const $ = cheerio.load(html)
  await t
    .expect(
      $(
        $('link[rel=preload]')
          .toArray()
          .find(i => $(i).attr('href') === 'https://cdn.ampproject.org/v0.js')
      ).attr('href')
    )
    .eql('https://cdn.ampproject.org/v0.js')
})

test('should drop custom scripts', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/custom-scripts')
  await t.expect(html).notMatch(/src='\/im-not-allowed\.js'/)
  await t.expect(html).notMatch(/console\.log("I'm not either :p")'/)
})

test('should not drop custom amp scripts', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/amp-script?amp=1')
  await validateAMP(html)
})

test('should optimize clean', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/only-amp')
  await validateAMP(html)
})

test('should render the normal page that uses the AMP hook', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/use-amp-hook')
  await t.expect(html).match(/Hello others/)
  await t.expect(html).match(/no AMP for you\.\.\./)
})

test('should render the AMP page that uses the AMP hook', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/use-amp-hook?amp=1')
  await validateAMP(html)
  await t.expect(html).match(/Hello AMP/)
  await t.expect(html).match(/AMP Power!!!/)
})

test('should render nested normal page with AMP hook', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/nested')
  await t.expect(html).match(/Hello others/)
})

test('should render nested AMP page with AMP hook', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/nested?amp=1')
  await validateAMP(html)
  await t.expect(html).match(/Hello AMP/)
})

test('should render link rel amphtml', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/use-amp-hook')
  const $ = cheerio.load(html)
  await t
    .expect(
      $('link[rel=amphtml]')
        .first()
        .attr('href')
    )
    .eql('http://localhost:1234/use-amp-hook.amp')
})

test('should render link rel amphtml with existing query', async t => {
  const html = await renderViaHTTP(
    t.fixtureCtx.appPort,
    '/use-amp-hook?hello=1'
  )
  await t.expect(html).notMatch(/&amp;amp=1/)
})

test('should render the AMP page that uses the AMP hook', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/use-amp-hook?amp=1')
  const $ = cheerio.load(html)
  await validateAMP(html)
  await t
    .expect(
      $('link[rel=canonical]')
        .first()
        .attr('href')
    )
    .eql('http://localhost:1234/use-amp-hook')
})

test('should render a canonical regardless of amp-only status (explicit)', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/only-amp')
  const $ = cheerio.load(html)
  await validateAMP(html)
  await t
    .expect(
      $('link[rel=canonical]')
        .first()
        .attr('href')
    )
    .eql('http://localhost:1234/only-amp')
})

test('should not render amphtml link tag with no AMP page', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/normal')
  const $ = cheerio.load(html)
  await t
    .expect(
      $('link[rel=amphtml]')
        .first()
        .attr('href')
    )
    .notOk()
})

test('should remove conflicting amp tags', async t => {
  const html = await renderViaHTTP(
    t.fixtureCtx.appPort,
    '/conflicting-tag?amp=1'
  )
  const $ = cheerio.load(html)
  await validateAMP(html)
  await t
    .expect($('meta[name=viewport]').attr('content'))
    .notEql('something :p')
})

test('should allow manually setting canonical', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/manual-rels?amp=1')
  const $ = cheerio.load(html)
  await validateAMP(html)
  await t
    .expect($('link[rel=canonical]').attr('href'))
    .eql('/my-custom-canonical')
})

test('should allow manually setting amphtml rel', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/manual-rels')
  const $ = cheerio.load(html)
  await t.expect($('link[rel=amphtml]').attr('href')).eql('/my-custom-amphtml')
})

test('should combine style tags', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/styled?amp=1')
  const $ = cheerio.load(html)
  await t
    .expect(
      $('style[amp-custom]')
        .first()
        .text()
    )
    .match(
      /div.jsx-\d+{color:red;}span.jsx-\d+{color:blue;}body{background-color:green;}/
    )
})

test('should remove sourceMaps from styles', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.appPort, '/styled?amp=1')
  const $ = cheerio.load(html)
  const styles = $('style[amp-custom]')
    .first()
    .text()

  await t.expect(styles).notMatch(/\/\*@ sourceURL=.*?\*\//)
  await t.expect(styles).notMatch(/\/\*# sourceMappingURL=.*\*\//)
})

fixture('AMP dev mode')
  .before(async ctx => {
    ctx.dynamicAppPort = await findPort()
    ctx.ampDynamic = await launchApp(appDir, ctx.dynamicAppPort)
  })
  .after(ctx => killApp(ctx.ampDynamic))

test('should navigate from non-AMP to AMP without error', async t => {
  const browser = await webdriver(t.fixtureCtx.dynamicAppPort, '/normal')
  await browser.elementByCss('#to-amp').click()
  await browser.waitForElementByCss('#only-amp')
  await t
    .expect(await browser.elementByCss('#only-amp').text())
    .match(/Only AMP/)
})

test('should add data-ampdevmode to development script tags', async t => {
  const html = await renderViaHTTP(t.fixtureCtx.dynamicAppPort, '/only-amp')
  const $ = cheerio.load(html)
  await t.expect($('html').attr('data-ampdevmode')).eql('')
  await t.expect($('script[data-ampdevmode]').length).eql(3)
})

test('should detect the changes and display it', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.dynamicAppPort, '/hmr/test')
    const text = await browser.elementByCss('p').text()
    await t.expect(text).eql('This is the hot AMP page.')

    const hmrTestPagePath = join(__dirname, '../', 'pages', 'hmr', 'test.js')

    const originalContent = readFileSync(hmrTestPagePath, 'utf8')
    const editedContent = originalContent.replace(
      'This is the hot AMP page',
      'This is a cold AMP page'
    )

    // change the content
    writeFileSync(hmrTestPagePath, editedContent, 'utf8')

    await check(() => getBrowserBodyText(browser), /This is a cold AMP page/)

    // add the original content
    writeFileSync(hmrTestPagePath, originalContent, 'utf8')

    await check(() => getBrowserBodyText(browser), /This is the hot AMP page/)
  } finally {
    await browser.close()
  }
})

test('should detect changes and refresh an AMP page', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.dynamicAppPort, '/hmr/amp')
    const text = await browser.elementByCss('p').text()
    await t.expect(text).eql(`I'm an AMP page!`)

    const hmrTestPagePath = join(__dirname, '../', 'pages', 'hmr', 'amp.js')

    const originalContent = readFileSync(hmrTestPagePath, 'utf8')
    const editedContent = originalContent.replace(
      `I'm an AMP page!`,
      'replaced it!'
    )

    // change the content
    writeFileSync(hmrTestPagePath, editedContent, 'utf8')

    await check(() => getBrowserBodyText(browser), /replaced it!/)

    // add the original content
    writeFileSync(hmrTestPagePath, originalContent, 'utf8')

    await check(() => getBrowserBodyText(browser), /I'm an AMP page!/)
  } finally {
    await browser.close()
  }
})

test('should not reload unless the page is edited for an AMP page', async t => {
  let browser
  try {
    await renderViaHTTP(t.fixtureCtx.dynamicAppPort, '/hmr/test')

    browser = await webdriver(t.fixtureCtx.dynamicAppPort, '/hmr/amp')
    const text = await browser.elementByCss('p').text()
    const origDate = await browser.elementByCss('span').text()
    await t.expect(text).eql(`I'm an AMP page!`)

    const hmrTestPagePath = join(__dirname, '../', 'pages', 'hmr', 'test.js')

    const originalContent = readFileSync(hmrTestPagePath, 'utf8')
    const editedContent = originalContent.replace(
      `This is the hot AMP page.`,
      'replaced it!'
    )

    // change the content
    writeFileSync(hmrTestPagePath, editedContent, 'utf8')

    let checks = 5
    let i = 0
    while (i < checks) {
      const curText = await browser.elementByCss('span').text()
      await t.expect(curText).eql(origDate)
      await waitFor(1000)
      i++
    }

    // add the original content
    writeFileSync(hmrTestPagePath, originalContent, 'utf8')

    const otherHmrTestPage = join(__dirname, '../pages/hmr/amp.js')

    const otherOrigContent = readFileSync(otherHmrTestPage, 'utf8')
    const otherEditedContent = otherOrigContent.replace(
      `I'm an AMP page!`,
      `replaced it!`
    )

    // change the content
    writeFileSync(otherHmrTestPage, otherEditedContent, 'utf8')

    await check(() => getBrowserBodyText(browser), /replaced it!/)

    // restore original content
    writeFileSync(otherHmrTestPage, otherOrigContent, 'utf8')

    await check(() => getBrowserBodyText(browser), /I'm an AMP page!/)
  } finally {
    await browser.close()
  }
})

test('should detect changes and refresh a hybrid AMP page', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.dynamicAppPort, '/hmr/hybrid?amp=1')
    const text = await browser.elementByCss('p').text()
    await t.expect(text).eql(`I'm a hybrid AMP page!`)

    const hmrTestPagePath = join(__dirname, '../', 'pages', 'hmr', 'hybrid.js')

    const originalContent = readFileSync(hmrTestPagePath, 'utf8')
    const editedContent = originalContent.replace(
      `I'm a hybrid AMP page!`,
      'replaced it!'
    )

    // change the content
    writeFileSync(hmrTestPagePath, editedContent, 'utf8')

    await check(() => getBrowserBodyText(browser), /replaced it!/)

    // add the original content
    writeFileSync(hmrTestPagePath, originalContent, 'utf8')

    await check(() => getBrowserBodyText(browser), /I'm a hybrid AMP page!/)
  } finally {
    await browser.close()
  }
})

test('should detect changes and refresh an AMP page at root pages/', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.dynamicAppPort, '/root-hmr')
    const text = await browser.elementByCss('p').text()
    await t.expect(text).eql(`I'm an AMP page!`)

    const hmrTestPagePath = join(__dirname, '../', 'pages', 'root-hmr.js')

    const originalContent = readFileSync(hmrTestPagePath, 'utf8')
    const editedContent = originalContent.replace(
      `I'm an AMP page!`,
      'replaced it!'
    )

    // change the content
    writeFileSync(hmrTestPagePath, editedContent, 'utf8')

    await check(() => getBrowserBodyText(browser), /replaced it!/)

    // add the original content
    writeFileSync(hmrTestPagePath, originalContent, 'utf8')

    await check(() => getBrowserBodyText(browser), /I'm an AMP page!/)
  } finally {
    await browser.close()
  }
})
