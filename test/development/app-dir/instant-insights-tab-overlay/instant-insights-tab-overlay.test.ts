import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('instant insights tab overlay', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // The dev overlay UI lives inside <nextjs-portal>'s shadow DOM, so we
  // can't use Playwright's regular selectors. These helpers query into
  // the portal directly via `browser.eval`.
  function evalInPortal<T>(browser: Playwright, fn: () => T): Promise<T> {
    return browser.eval(`(() => {
      const portal = document.querySelector('nextjs-portal');
      const root = portal && portal.shadowRoot;
      if (!root) return null;
      return (${fn.toString()})(root);
    })()`) as Promise<T>
  }

  function getIndicatorPillState(browser: Playwright) {
    return evalInPortal(browser, (root: any) => {
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
    return evalInPortal(browser, (root: any) => {
      return !!root.querySelector('[data-nextjs-error-overlay-tab-bar]')
    })
  }

  function getErrorOverlayTabCounts(browser: Playwright) {
    return evalInPortal(browser, (root: any) => {
      const bar = root.querySelector('[data-nextjs-error-overlay-tab-bar]')
      if (!bar) return null
      const errors = bar.querySelector(
        '.error-overlay-tab-count[data-variant="errors"]'
      )
      const instant = bar.querySelector(
        '.error-overlay-tab-count[data-variant="instant"]'
      )
      return {
        errors: parseInt(errors?.textContent || '0', 10),
        instant: parseInt(instant?.textContent || '0', 10),
      }
    })
  }

  function getActiveErrorOverlayTab(browser: Playwright) {
    return evalInPortal(browser, (root: any) => {
      const bar = root.querySelector('[data-nextjs-error-overlay-tab-bar]')
      if (!bar) return null
      const errors = bar.querySelector(
        '.error-overlay-tab[data-active="true"]'
      )
      const variant = errors?.querySelector('.error-overlay-tab-count')
      return variant?.getAttribute('data-variant') ?? null
    })
  }

  async function clickInsightsTab(browser: Playwright) {
    await browser.eval(`(() => {
      const portal = document.querySelector('nextjs-portal');
      const root = portal && portal.shadowRoot;
      if (!root) return;
      const bar = root.querySelector('[data-nextjs-error-overlay-tab-bar]');
      const tabs = bar ? bar.querySelectorAll('.error-overlay-tab') : [];
      tabs[1] && tabs[1].click();
    })()`)
  }

  it('shows a red pill and no tab bar when only a Blocking Route Issue is present', async () => {
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

  it('shows an amber pill when only an Insight is present', async () => {
    const browser = await next.browser('/')
    // Subnav into the insight-only route so the in-navigation
    // validation surfaces the error as an Instant Insight.
    await browser.elementByCss('a[href="/insight-only"]').click()

    await retry(async () => {
      const state = await getIndicatorPillState(browser)
      expect(state).not.toBeNull()
      expect(state!.insightsOnly).toBe(true)
      // When only insights remain, the pill should NOT render as a
      // red error pill.
      expect(state!.hasError).toBe(false)
      expect(state!.text).toMatch(/1\s*Insight/i)
    })

    // The tab bar is rendered whenever any instant error exists so the
    // user can see the Issues / Insights split. The Insights tab is
    // active by default since there are no Issues.
    expect(await hasErrorOverlayTabBar(browser)).toBe(true)
    expect(await getActiveErrorOverlayTab(browser)).toBe('instant')
  })

  it('shows both tabs (Issues + Insights) when an Issue and an Insight coexist', async () => {
    // Step 1: Land on the home page, then subnav into the issue-only
    // route. The SSR sync-io error registers as an Issue in the
    // overlay.
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/issue-only"]').click()
    await retry(async () => {
      const state = await getIndicatorPillState(browser)
      expect(state?.text).toMatch(/1\s*Issue/i)
    })

    // Step 2: Go back and subnav to the insight-only route. The
    // Insight accumulates on top of the SSR-streamed Issue.
    await browser.eval('history.back()')
    await browser.waitForElementByCss('a[href="/insight-only"]')
    await browser.elementByCss('a[href="/insight-only"]').click()

    await retry(async () => {
      const counts = await getErrorOverlayTabCounts(browser)
      expect(counts).not.toBeNull()
      expect(counts!.errors).toBeGreaterThanOrEqual(1)
      expect(counts!.instant).toBeGreaterThanOrEqual(1)
    })

    // The pill should be red (not amber) because there is still at
    // least one normal Issue.
    const pill = await getIndicatorPillState(browser)
    expect(pill?.hasError).toBe(true)
    expect(pill?.insightsOnly).toBe(false)

    // The Issues tab should be the default active tab when both
    // categories have entries.
    expect(await getActiveErrorOverlayTab(browser)).toBe('errors')

    // Clicking the Insights tab switches the active error.
    await clickInsightsTab(browser)
    await retry(async () => {
      expect(await getActiveErrorOverlayTab(browser)).toBe('instant')
    })
  })
})
