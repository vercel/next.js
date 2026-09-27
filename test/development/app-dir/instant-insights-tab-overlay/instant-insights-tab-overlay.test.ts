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

  function clickIndicatorPill(browser: Playwright) {
    return browser.eval(`(() => {
      const portal = document.querySelector('nextjs-portal');
      const root = portal && portal.shadowRoot;
      if (!root) return;
      root.querySelector('[data-issues-open]')?.click();
    })()`)
  }

  function getErrorOverlayNavLayout(browser: Playwright) {
    return evalInPortal(browser, (root) => {
      const nav = [
        ...root.querySelectorAll('[data-nextjs-error-overlay-nav]'),
      ].find((element: Element) => element.getBoundingClientRect().width > 0)
      const left = nav?.querySelector('[data-side="left"]')
      const right = nav?.querySelector('[data-side="right"]')
      const leftContent = left?.firstElementChild
      const rightContent = right?.firstElementChild
      if (!nav || !leftContent || !rightContent) return null

      return {
        leftTop: leftContent.getBoundingClientRect().top,
        leftBottom: leftContent.getBoundingClientRect().bottom,
        leftEdge: leftContent.getBoundingClientRect().left,
        rightTop: rightContent.getBoundingClientRect().top,
        rightBottom: rightContent.getBoundingClientRect().bottom,
        rightLeft: rightContent.getBoundingClientRect().left,
        rightEdge: rightContent.getBoundingClientRect().right,
        navRightEdge: nav.getBoundingClientRect().right,
        navBottomEdge: nav.getBoundingClientRect().bottom,
        navPaddingRight: parseFloat(getComputedStyle(nav).paddingRight),
        navPaddingBottom: parseFloat(getComputedStyle(nav).paddingBottom),
        clientWidth: nav.clientWidth,
        scrollWidth: nav.scrollWidth,
      }
    })
  }

  function getErrorOverlayTabCounts(browser: Playwright) {
    return evalInPortal(browser, (root) => {
      const bar = root.querySelector('[data-nextjs-error-overlay-tab-bar]')
      if (!bar) return null
      const tabs = bar.querySelectorAll('.error-overlay-tab')
      const parseTotal = (tab: Element | undefined) => {
        const totalEl = tab?.querySelector(
          '.error-overlay-pagination-count > span:last-child'
        )
        return parseInt(totalEl?.textContent || '0', 10)
      }
      return {
        errors: parseTotal(tabs[0]),
        instant: parseTotal(tabs[1]),
      }
    })
  }

  function getActiveErrorOverlayTab(browser: Playwright) {
    return evalInPortal(browser, (root) => {
      const bar = root.querySelector('[data-nextjs-error-overlay-tab-bar]')
      if (!bar) return null
      const tabs = [...bar.querySelectorAll('.error-overlay-tab')]
      const activeIndex = tabs.findIndex(
        (tab) => tab.getAttribute('data-active') === 'true'
      )
      if (activeIndex === -1) return null
      return activeIndex === 0 ? 'errors' : 'instant'
    })
  }

  function getErrorOverlayTabs(browser: Playwright) {
    return evalInPortal(browser, (root) => {
      const bar = root.querySelector('[data-nextjs-error-overlay-tab-bar]')
      if (!bar) return null
      const variants = ['errors', 'instant'] as const
      return [...bar.querySelectorAll('.error-overlay-tab')].map(
        (tab: any, index: number) => ({
          variant: variants[index],
          disabled: tab.disabled === true,
          active: tab.getAttribute('data-active') === 'true',
        })
      )
    })
  }

  function clickIssuesTab(browser: Playwright) {
    return browser.eval(`(() => {
      const portal = document.querySelector('nextjs-portal');
      const root = portal && portal.shadowRoot;
      if (!root) return;
      const tabs = root.querySelectorAll(
        '[data-nextjs-error-overlay-tab-bar] .error-overlay-tab'
      );
      tabs[0] && tabs[0].click();
    })()`)
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

  it('should wrap the mobile overlay header only when it does not fit', async () => {
    const browser = await next.browser('/issue-only')

    await retry(async () => {
      expect((await getIndicatorPillState(browser))?.text).toMatch(/1\s*Issue/i)
    })

    await browser.setDimensions({ width: 390, height: 844 })
    await clickIndicatorPill(browser)

    await retry(async () => {
      const layout = await getErrorOverlayNavLayout(browser)
      expect(layout).not.toBeNull()
      expect(Math.abs(layout!.rightTop - layout!.leftTop)).toBeLessThan(4)
      expect(
        Math.abs(
          layout!.navRightEdge - layout!.rightEdge - layout!.navPaddingRight
        )
      ).toBeLessThan(2)
      expect(layout!.scrollWidth).toBe(layout!.clientWidth)
    })

    await browser.setDimensions({ width: 320, height: 844 })

    await retry(async () => {
      const layout = await getErrorOverlayNavLayout(browser)
      expect(layout).not.toBeNull()
      expect(layout!.rightTop - layout!.leftTop).toBeGreaterThan(4)
      expect(Math.abs(layout!.rightLeft - layout!.leftEdge)).toBeLessThan(2)
      expect(Math.abs(layout!.rightTop - layout!.leftBottom)).toBeLessThan(2)
      expect(
        Math.abs(
          layout!.navBottomEdge - layout!.rightBottom - layout!.navPaddingBottom
        )
      ).toBeLessThan(2)
      expect(layout!.scrollWidth).toBe(layout!.clientWidth)
    })
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

    expect(await getErrorOverlayTabs(browser)).toEqual([
      { variant: 'errors', disabled: true, active: false },
      { variant: 'instant', disabled: false, active: true },
    ])
    expect(await getErrorOverlayTabCounts(browser)).toEqual({
      errors: 0,
      instant: 1,
    })
  })

  it('should not switch tabs when clicking a disabled tab', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/insight-only"]').click()

    await retry(async () => {
      expect(await getActiveErrorOverlayTab(browser)).toBe('instant')
    })

    await clickIssuesTab(browser)
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
      expect(counts).toEqual({ errors: 1, instant: 1 })
    })

    const pill = await getIndicatorPillState(browser)
    expect(pill?.hasError).toBe(true)
    expect(pill?.insightsOnly).toBe(false)
    expect(pill?.text).toMatch(/1\s*Issue\s*·\s*1\s*Insight/i)

    expect(await getErrorOverlayTabs(browser)).toEqual([
      { variant: 'errors', disabled: false, active: true },
      { variant: 'instant', disabled: false, active: false },
    ])

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
