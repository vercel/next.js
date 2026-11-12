import { nextTestSetup } from 'e2e-utils'

const NON_JS_BOT =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'
const HTML_LIMITED_BOT = 'Twitterbot/1.0'

describe('non-js-bots', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe.each([
    ['/large-boundary', 'app'],
    ['/ssr-large', 'pages'],
  ])('%s', (route, marker) => {
    it('shows large boundaries to non-JS bots when enabled', async () => {
      // Resolved-config gate conditions do not see env-forced values in
      // adapter deploy jobs, so read the job env directly.
      const disableProgressiveLoadingForNonJsBots =
        process.env
          .__NEXT_EXPERIMENTAL_DISABLE_PROGRESSIVE_LOADING_FOR_NON_JS_BOTS ===
        'true'
      const browser = await next.browser(route, {
        userAgent: NON_JS_BOT,
        disableJavaScript: true,
        waitUntil: 'load',
      })
      const start = await browser.waitForElementByCss(
        `[data-testid="marker-${marker}-start"]`,
        { state: 'attached' }
      )
      expect(await start.evaluate((el: Element) => el.checkVisibility())).toBe(
        disableProgressiveLoadingForNonJsBots
      )
      const end = await browser.waitForElementByCss(
        `[data-testid="marker-${marker}-end"]`,
        { state: 'attached' }
      )
      expect(await end.evaluate((el: Element) => el.checkVisibility())).toBe(
        disableProgressiveLoadingForNonJsBots
      )
    })

    it('reveals large boundaries only with JavaScript for regular browsers', async () => {
      const browser = await next.browser(route, {
        disableJavaScript: true,
        waitUntil: 'load',
      })
      const element = await browser.waitForElementByCss(
        `[data-testid="marker-${marker}-start"]`,
        { state: 'attached' }
      )
      expect(
        await element.evaluate((el: Element) => el.checkVisibility())
      ).toBe(false)
    })

    it('reveals large boundaries only with JavaScript for JS-capable bots', async () => {
      const browser = await next.browser(route, {
        userAgent: HTML_LIMITED_BOT,
        disableJavaScript: true,
        waitUntil: 'load',
      })
      const element = await browser.waitForElementByCss(
        `[data-testid="marker-${marker}-start"]`,
        { state: 'attached' }
      )
      expect(
        await element.evaluate((el: Element) => el.checkVisibility())
      ).toBe(false)
    })
  })

  describe('prerendered routes', () => {
    it('shows prerendered boundaries to non-JS bots when enabled (app)', async () => {
      // Resolved-config gate conditions do not see env-forced values in
      // adapter deploy jobs, so read the job env directly.
      const disableProgressiveLoadingForNonJsBots =
        process.env
          .__NEXT_EXPERIMENTAL_DISABLE_PROGRESSIVE_LOADING_FOR_NON_JS_BOTS ===
        'true'
      const browser = await next.browser('/static-large-boundary', {
        userAgent: NON_JS_BOT,
        disableJavaScript: true,
        waitUntil: 'load',
      })
      const start = await browser.waitForElementByCss(
        '[data-testid="marker-app-start"]',
        { state: 'attached' }
      )
      expect(await start.evaluate((el: Element) => el.checkVisibility())).toBe(
        disableProgressiveLoadingForNonJsBots
      )
      const end = await browser.waitForElementByCss(
        '[data-testid="marker-app-end"]',
        { state: 'attached' }
      )
      expect(await end.evaluate((el: Element) => el.checkVisibility())).toBe(
        disableProgressiveLoadingForNonJsBots
      )
    })

    it('reveals prerendered boundaries only with JavaScript for regular browsers (app)', async () => {
      const browser = await next.browser('/static-large-boundary', {
        disableJavaScript: true,
        waitUntil: 'load',
      })
      const element = await browser.waitForElementByCss(
        '[data-testid="marker-app-start"]',
        { state: 'attached' }
      )
      expect(
        await element.evaluate((el: Element) => el.checkVisibility())
      ).toBe(false)
    })

    it('shows prerendered boundaries to non-JS bots when enabled (pages)', async () => {
      // Resolved-config gate conditions do not see env-forced values in
      // adapter deploy jobs, so read the job env directly.
      const disableProgressiveLoadingForNonJsBots =
        process.env
          .__NEXT_EXPERIMENTAL_DISABLE_PROGRESSIVE_LOADING_FOR_NON_JS_BOTS ===
        'true'
      const browser = await next.browser('/static-large', {
        userAgent: NON_JS_BOT,
        disableJavaScript: true,
        waitUntil: 'load',
      })
      const start = await browser.waitForElementByCss(
        '[data-testid="marker-pages-start"]',
        { state: 'attached' }
      )
      expect(await start.evaluate((el: Element) => el.checkVisibility())).toBe(
        disableProgressiveLoadingForNonJsBots
      )
      const end = await browser.waitForElementByCss(
        '[data-testid="marker-pages-end"]',
        { state: 'attached' }
      )
      expect(await end.evaluate((el: Element) => el.checkVisibility())).toBe(
        disableProgressiveLoadingForNonJsBots
      )
    })

    it('reveals prerendered boundaries only with JavaScript for regular browsers (pages)', async () => {
      const browser = await next.browser('/static-large', {
        disableJavaScript: true,
        waitUntil: 'load',
      })
      const element = await browser.waitForElementByCss(
        '[data-testid="marker-pages-start"]',
        { state: 'attached' }
      )
      expect(
        await element.evaluate((el: Element) => el.checkVisibility())
      ).toBe(false)
    })
  })

  describe('/slow-boundary', () => {
    it('shows resolved content to non-JS bots when enabled', async () => {
      // Resolved-config gate conditions do not see env-forced values in
      // adapter deploy jobs, so read the job env directly.
      const disableProgressiveLoadingForNonJsBots =
        process.env
          .__NEXT_EXPERIMENTAL_DISABLE_PROGRESSIVE_LOADING_FOR_NON_JS_BOTS ===
        'true'
      const browser = await next.browser('/slow-boundary', {
        userAgent: NON_JS_BOT,
        disableJavaScript: true,
        waitUntil: 'load',
      })
      const content = await browser.waitForElementByCss(
        '[data-testid="slow-content-marker"]',
        { state: 'attached' }
      )
      expect(
        await content.evaluate((el: Element) => el.checkVisibility())
      ).toBe(disableProgressiveLoadingForNonJsBots)
      // The fallback never renders for non-JS bots when enabled.
      expect(
        await browser.hasElementByCss('[data-testid="slow-fallback-marker"]')
      ).toBe(!disableProgressiveLoadingForNonJsBots)
    })

    it('shows pending fallbacks to regular browsers', async () => {
      const browser = await next.browser('/slow-boundary', {
        disableJavaScript: true,
        waitUntil: 'load',
      })
      const fallback = await browser.waitForElementByCss(
        '[data-testid="slow-fallback-marker"]',
        { state: 'attached' }
      )
      expect(
        await fallback.evaluate((el: Element) => el.checkVisibility())
      ).toBe(true)
    })
  })
})
