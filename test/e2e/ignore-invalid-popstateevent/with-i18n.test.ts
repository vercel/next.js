import { join } from 'path'
import { FileRef, nextTestSetup, type Playwright } from 'e2e-utils'
import { check, retry, waitFor } from 'next-test-utils'

import type { HistoryState } from 'next/dist/shared/lib/router/router'

const emitPopsStateEvent = (browser: Playwright, state: HistoryState) =>
  browser.eval(
    `window.dispatchEvent(new PopStateEvent("popstate", { state: ${JSON.stringify(
      state
    )} }))`
  )

describe('i18n: Event with stale state - static route previously was dynamic', () => {
  const { next } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, 'app/pages')),
      'next.config.js': new FileRef(join(__dirname, 'app/next.config.js')),
    },
    dependencies: {},
  })

  test('Ignore event without query param', async () => {
    const browser = await next.browser('/sv/static')

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
    const browser = await next.browser('/sv/static?param=1')

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
    const browser = await next.browser('/sv/static?param=1')

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

  describe('popstate back to initial entry', () => {
    test('does not re-run getServerSideProps or emit routeChangeStart for non-default locale', async () => {
      const browser = await next.browser('/sv/gssp')

      const initialRenderedAt = await browser
        .elementByCss('#rendered-at')
        .text()
      expect(await browser.elementByCss('#locale').text()).toBe('sv')

      await browser.elementByCss('#push-state').click()
      await retry(async () => {
        expect(await browser.eval('window.location.pathname')).toBe(
          '/sv/gssp/modal'
        )
      })

      await browser.elementByCss('#go-back').click()
      await retry(async () => {
        expect(await browser.elementByCss('#popstate-count').text()).toBe('1')
      })

      const afterRenderedAt = await browser.elementByCss('#rendered-at').text()
      expect(afterRenderedAt).toBe(initialRenderedAt)
      expect(await browser.elementByCss('#log').text()).toBe('log:')
    })

    test('retains expected behavior for default locale', async () => {
      const browser = await next.browser('/gssp')

      const initialRenderedAt = await browser
        .elementByCss('#rendered-at')
        .text()
      expect(await browser.elementByCss('#locale').text()).toBe('en')

      await browser.elementByCss('#push-state').click()
      await retry(async () => {
        expect(await browser.eval('window.location.pathname')).toBe(
          '/gssp/modal'
        )
      })

      await browser.elementByCss('#go-back').click()
      await retry(async () => {
        expect(await browser.elementByCss('#popstate-count').text()).toBe('1')
      })

      const afterRenderedAt = await browser.elementByCss('#rendered-at').text()
      expect(afterRenderedAt).toBe(initialRenderedAt)
      expect(await browser.elementByCss('#log').text()).toBe('log:')
    })

    test('still navigates when popstate targets a different route', async () => {
      const browser = await next.browser('/sv/static')
      expect(await browser.elementByCss('#page-type').text()).toBe('static')

      await browser.eval(() => {
        ;(window as any).next.router.push('/gssp')
      })
      await check(() => browser.elementByCss('#page-type').text(), 'gssp')

      await browser.eval(() => window.history.back())
      await check(() => browser.elementByCss('#page-type').text(), 'static')
    })
  })
})
