import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, waitFor } from 'next-test-utils'
import webdriver from 'next-webdriver'

import type { HistoryState } from '../../../packages/next/src/shared/lib/router/router'
import { BrowserInterface } from 'test/lib/browsers/base'

const emitPopsStateEvent = (browser: BrowserInterface, state: HistoryState) =>
  browser.eval(
    `window.dispatchEvent(new PopStateEvent("popstate", { state: ${JSON.stringify(
      state
    )} }))`
  )

describe('i18n: Event with stale state - static route previously was dynamic', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
        'next.config.js': new FileRef(join(__dirname, 'app/next.config.js')),
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  test('Ignore event without query param', async () => {
    const browser = await webdriver(next.url, '/sv/static')

    const state: HistoryState = {
      url: '/[dynamic]?',
      as: '/static',
      options: { locale: 'sv' },
      __N: true,
      key: '',
    }

    expect(await browser.elementByCss('#page-type').text()).toBe('static')

    // 1st event is ignored
    await emitPopsStateEvent(browser, state)
    await waitFor(1000)
    expect(await browser.elementByCss('#page-type').text()).toBe('static')

    // 2nd event isn't ignored
    await emitPopsStateEvent(browser, state)
    await check(() => browser.elementByCss('#page-type').text(), 'dynamic')
  })

  test('Ignore event with query param', async () => {
    const browser = await webdriver(next.url, '/sv/static?param=1')

    const state: HistoryState = {
      url: '/[dynamic]?param=1',
      as: '/static?param=1',
      options: { locale: 'sv' },
      __N: true,
      key: '',
    }

    expect(await browser.elementByCss('#page-type').text()).toBe('static')

    // 1st event is ignored
    await emitPopsStateEvent(browser, state)
    await waitFor(1000)
    expect(await browser.elementByCss('#page-type').text()).toBe('static')

    // 2nd event isn't ignored
    await emitPopsStateEvent(browser, state)
    await check(() => browser.elementByCss('#page-type').text(), 'dynamic')
  })

  test("Don't ignore event with different locale", async () => {
    const browser = await webdriver(next.url, '/sv/static?param=1')

    const state: HistoryState = {
      url: '/[dynamic]?param=1',
      as: '/static?param=1',
      options: { locale: 'en' },
      __N: true,
      key: '',
    }

    expect(await browser.elementByCss('#page-type').text()).toBe('static')

    await emitPopsStateEvent(browser, state)
    await check(() => browser.elementByCss('#page-type').text(), 'dynamic')
  })
})
