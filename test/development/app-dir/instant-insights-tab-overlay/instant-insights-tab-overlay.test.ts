import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('instant insights tab overlay', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // The dev overlay UI lives inside <nextjs-portal>'s shadow DOM, so we
  // can't use Playwright's regular selectors.
  function evalInPortal<T>(browser: Playwright, fn: (root: any) => T) {
    return browser.eval(`(() => {
      const portal = document.querySelector('nextjs-portal');
      const root = portal && portal.shadowRoot;
      if (!root) return null;
      return (${fn.toString()})(root);
    })()`) as Promise<T>
  }

  function getIndicatorPillState(browser: Playwright) {
    return evalInPortal(browser, (root) => {
      const badge = root.querySelector('[data-next-badge]')
      if (!badge) return null
      return {
        hasError: badge.getAttribute('data-error') === 'true',
        insightsOnly: badge.getAttribute('data-insights-only') === 'true',
        text: badge.textContent?.trim() ?? '',
      }
    })
  }

  function hasErrorOverlayTabBar(browser: Playwright) {
    return evalInPortal(browser, (root) => {
      return !!root.querySelector('[data-nextjs-error-overlay-tab-bar]')
    })
  }

  function getErrorOverlayTabCounts(browser: Playwright) {
    return evalInPortal(browser, (root) => {
      const bar = root.querySelector('[data-nextjs-error-overlay-tab-bar]')
      if (!bar) return null
      return {
        errors: parseInt(
          bar.querySelector('.error-overlay-tab-count[data-variant="errors"]')
            ?.textContent || '0',
          10
        ),
        instant: parseInt(
          bar.querySelector('.error-overlay-tab-count[data-variant="instant"]')
            ?.textContent || '0',
          10
        ),
      }
    })
  }

  function getActiveErrorOverlayTab(browser: Playwright) {
    return evalInPortal(browser, (root) => {
      const active = root.querySelector(
        '[data-nextjs-error-overlay-tab-bar] .error-overlay-tab[data-active="true"]'
      )
      return (
        active
          ?.querySelector('.error-overlay-tab-count')
          ?.getAttribute('data-variant') ?? null
      )
    })
  }

  function clickInsightsTab(browser: Playwright) {
    return browser.eval(`(() => {
      const portal = document.querySelector('nextjs-portal');
      const root = portal && portal.shadowRoot;
      if (!root) return;
      const tabs = root.querySelectorAll(
        '[data-nextjs-error-overlay-tab-bar] .error-overlay-tab'
      );
      tabs[1] && tabs[1].click();
    })()`)
  }

  it('should show a red pill and no tab bar when only an Issue is present', async () => {
    const browser = await next.browser('/issue-only')

    await retry(async () => {
      const state = await getIndicatorPillState(browser)
      expect(state).not.toBeNull()
      expect(state!.hasError).toBe(true)
      expect(state!.insightsOnly).toBe(false)
      expect(state!.text).toMatch(/1\s*Issue/i)
    })

    expect(await hasErrorOverlayTabBar(browser)).toBe(false)
  })

  it('should show an amber pill when only an Insight is present', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/insight-only"]').click()

    await retry(async () => {
      const state = await getIndicatorPillState(browser)
      expect(state).not.toBeNull()
      expect(state!.hasError).toBe(false)
      expect(state!.insightsOnly).toBe(true)
      expect(state!.text).toMatch(/1\s*Insight/i)
    })

    expect(await hasErrorOverlayTabBar(browser)).toBe(true)
    expect(await getActiveErrorOverlayTab(browser)).toBe('instant')
  })

  it('should show both tabs when an Issue and an Insight coexist', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/issue-only"]').click()

    await retry(async () => {
      const state = await getIndicatorPillState(browser)
      expect(state?.text).toMatch(/1\s*Issue/i)
    })

    await browser.eval('history.back()')
    await browser.waitForElementByCss('a[href="/insight-only"]')
    await browser.elementByCss('a[href="/insight-only"]').click()

    await retry(async () => {
      const counts = await getErrorOverlayTabCounts(browser)
      expect(counts).not.toBeNull()
      expect(counts!.errors).toBeGreaterThanOrEqual(1)
      expect(counts!.instant).toBeGreaterThanOrEqual(1)
    })

    const pill = await getIndicatorPillState(browser)
    expect(pill?.hasError).toBe(true)
    expect(pill?.insightsOnly).toBe(false)

    expect(await getActiveErrorOverlayTab(browser)).toBe('errors')

    await clickInsightsTab(browser)
    await retry(async () => {
      expect(await getActiveErrorOverlayTab(browser)).toBe('instant')
    })
  })

  it('should clear the Insight when navigating away from the offending route', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/insight-only"]').click()

    await retry(async () => {
      const state = await getIndicatorPillState(browser)
      expect(state?.text).toMatch(/1\s*Insight/i)
    })

    await browser.eval('history.back()')
    await browser.waitForElementByCss('a[href="/insight-only"]')

    await retry(async () => {
      const state = await getIndicatorPillState(browser)
      expect(state).not.toBeNull()
      expect(state!.hasError).toBe(false)
      expect(state!.insightsOnly).toBe(false)
    })
  })
})
