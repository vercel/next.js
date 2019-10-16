/* global fixture, test */
import 'testcafe'

import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  nextServer,
  runNextCommand,
  startApp,
  stopApp,
  waitFor
} from 'next-test-utils'

const appDir = join(__dirname, '../')

fixture('Prefetching Links in viewport')
  .before(async ctx => {
    await runNextCommand(['build', appDir])

    ctx.app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    ctx.server = await startApp(ctx.app)
    ctx.appPort = ctx.server.address().port
  })
  .after(ctx => stopApp(ctx.server))

test('should prefetch with link in viewport onload', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/')
    await waitFor(2 * 1000)
    const links = await browser.elementsByCss('link[rel=preload]')
    let found = false

    for (const link of links) {
      const href = await link.getAttribute('href')
      if (href.includes('first')) {
        found = true
        break
      }
    }
    await t.expect(found).eql(true)
  } finally {
    if (browser) await browser.close()
  }
})

test('should prefetch with link in viewport when href changes', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/')
    await browser.elementByCss('button').click()
    await waitFor(2 * 1000)

    const links = await browser.elementsByCss('link[rel=preload]')
    let foundFirst = false
    let foundAnother = false

    for (const link of links) {
      const href = await link.getAttribute('href')
      if (href.includes('another')) foundAnother = true
      if (href.includes('first')) foundFirst = true
    }
    await t.expect(foundFirst).eql(true)
    await t.expect(foundAnother).eql(true)
  } finally {
    if (browser) await browser.close()
  }
})

test('should prefetch with link in viewport on scroll', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/')
    await browser.elementByCss('#scroll-to-another').click()
    await waitFor(2 * 1000)

    const links = await browser.elementsByCss('link[rel=preload]')
    let found = false

    for (const link of links) {
      const href = await link.getAttribute('href')
      if (href.includes('another')) {
        found = true
        break
      }
    }
    await t.expect(found).eql(true)
  } finally {
    if (browser) await browser.close()
  }
})

test('should fallback to prefetching onMouseEnter with invalid ref', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/invalid-ref')
    await browser.elementByCss('#btn-link').moveTo()
    await waitFor(2 * 1000)

    const links = await browser.elementsByCss('link[rel=preload]')
    let found = false

    for (const link of links) {
      const href = await link.getAttribute('href')
      if (href.includes('another')) {
        found = true
        break
      }
    }
    await t.expect(found).eql(true)
  } finally {
    if (browser) await browser.close()
  }
})

test('should not prefetch when prefetch is explicitly set to false', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/opt-out')
  await waitFor(2 * 1000)

  const links = await browser.elementsByCss('link[rel=preload]')
  let found = false

  for (const link of links) {
    const href = await link.getAttribute('href')
    if (href.includes('another')) {
      found = true
      break
    }
  }
  await t.expect(found).eql(false)
})
