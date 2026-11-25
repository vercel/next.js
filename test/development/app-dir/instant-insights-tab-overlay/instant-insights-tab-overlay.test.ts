import { nextTestSetup, type Playwright } from 'e2e-utils'
import {
  assertNoDevToolsIndicator,
  getRedboxDescription,
  retry,
  toggleDevToolsIndicatorPopover,
} from 'next-test-utils'

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
        leftWidth: leftContent.getBoundingClientRect().width,
        rightWidth: rightContent.getBoundingClientRect().width,
        navRightEdge: nav.getBoundingClientRect().right,
        navBottomEdge: nav.getBoundingClientRect().bottom,
        navPaddingLeft: parseFloat(getComputedStyle(nav).paddingLeft),
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

    await browser.setDimensions({ width: 767, height: 844 })
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

    await browser.setDimensions({ width: 390, height: 844 })
    const mobileLayout = (await getErrorOverlayNavLayout(browser))!
    const wrappedWidth = Math.ceil(
      Math.max(mobileLayout.leftWidth, mobileLayout.rightWidth) +
        390 -
        mobileLayout.clientWidth +
        mobileLayout.navPaddingLeft +
        mobileLayout.navPaddingRight +
        4
    )
    await browser.setDimensions({ width: wrappedWidth, height: 844 })

    await retry(async () => {
      const layout = await getErrorOverlayNavLayout(browser)
      expect(layout).not.toBeNull()
      expect(layout!.rightTop - layout!.leftTop).toBeGreaterThan(4)
      expect(Math.abs(layout!.rightLeft - layout!.leftEdge)).toBeLessThan(2)
      expect(layout!.rightTop - layout!.leftBottom).toBeCloseTo(8, 0)
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

  it('opens Issues on a render crash after viewing Insights', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/insight-only"]').click()

    const insightsChip = '[data-issues-tab="instant"]'
    const openDialog = '[data-nextjs-dialog-root][data-rendered="true"]'
    await browser.elementByCss(insightsChip).click()
    await browser.waitForElementByCss(openDialog)
    expect(await getActiveErrorOverlayTab(browser)).toBe('instant')
    await browser.elementByCss(insightsChip).click()
    await browser.locator(openDialog).waitFor({ state: 'hidden' })

    await browser.locator('button', { hasText: 'Crash during render' }).click()
    await browser.waitForElementByCss(openDialog)
    await retry(async () => {
      expect((await getErrorOverlayTabCounts(browser))?.instant).toBe(1)
      expect(await getActiveErrorOverlayTab(browser)).toBe('errors')
      expect(await getRedboxDescription(browser)).toContain(
        'Crash after viewing an Insight'
      )
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
    expect(
      await evalInPortal(browser, (root: ShadowRoot) =>
        Array.from(root.querySelectorAll('[data-issues-open]'), (button) =>
          button.getAttribute('aria-label')
        )
      )
    ).toEqual(['Open 1 issue', 'Open 1 Insight'])

    expect(await getErrorOverlayTabs(browser)).toEqual([
      { variant: 'errors', disabled: false, active: true },
      { variant: 'instant', disabled: false, active: false },
    ])

    if (
      !(await evalInPortal(browser, (root: ShadowRoot) =>
        Boolean(
          root.querySelector('[data-nextjs-dialog-root][data-rendered="true"]')
        )
      ))
    ) {
      await clickIndicatorPill(browser)
    }
    await retry(async () => {
      expect(
        await evalInPortal(browser, (root: ShadowRoot) =>
          Boolean(
            root.querySelector(
              '[data-nextjs-dialog-root][data-rendered="true"]'
            )
          )
        )
      ).toBe(true)
    })
    await evalInPortal(browser, (root: ShadowRoot) => {
      root
        .querySelector('[data-nextjs-dialog-root]')
        ?.setAttribute('data-test-open-dialog', '')
    })

    await clickInsightsTab(browser)
    await retry(async () => {
      expect(await getActiveErrorOverlayTab(browser)).toBe('instant')
    })

    for (const tab of ['errors', 'instant']) {
      await browser.elementByCss(`[data-issues-tab="${tab}"]`).click()
      await retry(async () => {
        expect(await getActiveErrorOverlayTab(browser)).toBe(tab)
        expect(
          await evalInPortal(browser, (root: ShadowRoot) =>
            Boolean(
              root.querySelector(
                '[data-test-open-dialog][data-rendered="true"]'
              )
            )
          )
        ).toBe(true)
      })
    }

    await browser.elementByCss('[data-issues-tab="instant"]').click()
    await browser.elementByCss('[data-issues-collapse]').click()
    await retry(async () => {
      expect(await browser.elementByCss('[data-collapsed-count]').text()).toBe(
        '2'
      )
      expect(
        await browser.elementByCss('#next-logo').getAttribute('aria-label')
      ).toBe('Show 2 diagnostics')
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

  it('should restore a collapsed badge, hide current diagnostics, and show new diagnostics', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/insight-only"]').click()
    await retry(async () => {
      expect((await getIndicatorPillState(browser))?.text).toMatch(
        /1\s*Insight/i
      )
    })
    await clickIndicatorPill(browser)

    await browser.elementByCss('[aria-label="Collapse badge"]').click()
    await retry(async () => {
      expect(await browser.hasElementByCssSelector('[data-issues]')).toBe(false)
      expect(
        await evalInPortal(browser, (root) => root.activeElement?.id)
      ).toBe('next-logo')
    })
    // Collapsed, the colored N stands in for the diagnostics: clicking it
    // expands the badge again instead of opening the menu.
    await browser.elementByCss('#next-logo').click()
    await retry(async () => {
      expect((await getIndicatorPillState(browser))?.text).toMatch(
        /1\s*Insight/i
      )
    })
    await browser.elementByCss('[data-issues-collapse]').click()
    await toggleDevToolsIndicatorPopover(browser)
    await retry(async () => {
      expect((await getIndicatorPillState(browser))?.text).toMatch(
        /1\s*Insight/i
      )
    })
    await toggleDevToolsIndicatorPopover(browser)
    await browser
      .locator('[role="menuitem"]', { hasText: 'Diagnostics' })
      .click()
    await retry(async () => {
      expect((await getIndicatorPillState(browser))?.text).toMatch(
        /1\s*Insight/i
      )
    })

    await clickIndicatorPill(browser)
    await toggleDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-preferences]').click()
    await browser.waitForElementByCss('select[name="position"]')
    await browser.elementByCss('[data-hide-dev-tools]').click()
    await retry(async () => {
      await assertNoDevToolsIndicator(browser)
    })

    // Hiding acknowledges the current diagnostic, without disabling validation
    // or suppressing diagnostics reported afterwards.
    await browser.eval(() => {
      console.error('A new diagnostic after hiding DevTools')
    })
    await retry(async () => {
      expect((await getIndicatorPillState(browser))?.text).toMatch(/Issue/i)
    })
    await clickIndicatorPill(browser)

    // The menu is directly available beside a diagnostic even when the
    // idle indicator is hidden, without having to dismiss the diagnostic.
    await toggleDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-preferences]').click()
    await browser.waitForElementByCss('select[name="position"]')
    // New diagnostics keep the menu available, but the idle indicator is
    // still hidden. The Show indicator switch must reflect that.
    expect(
      await browser
        .elementByCss('[data-hide-dev-tools]')
        .getAttribute('aria-checked')
    ).toBe('false')
    await browser.elementByCss('[data-hide-dev-tools]').click()
    await toggleDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-preferences]').click()
    expect(
      await browser
        .elementByCss('[data-hide-dev-tools]')
        .getAttribute('aria-checked')
    ).toBe('true')
    await browser.elementByCss('[data-hide-dev-tools]').click()
    await retry(async () => {
      await assertNoDevToolsIndicator(browser)
    })
    await browser.eval(() => {
      console.error('Another new diagnostic after hiding DevTools')
    })
    await retry(async () => {
      expect((await getIndicatorPillState(browser))?.text).toMatch(/Issue/i)
    })
    await clickIndicatorPill(browser)
    await browser.elementByCss('[aria-label="Dismiss badge"]').click()
    await retry(async () => {
      await assertNoDevToolsIndicator(browser)
    })
  })
})
