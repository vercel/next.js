import { nextTestSetup } from 'e2e-utils'

const NON_JS_BOT =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'
const MINIBOT_UA = 'Minibot/1.0'

describe('non-js-bots custom regex', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NON_JS_BOTS_REGEX: 'Minibot',
    },
  })

  it('shows large boundaries to bots matching the custom regex', async () => {
    const browser = await next.browser('/large-boundary', {
      userAgent: MINIBOT_UA,
      disableJavaScript: true,
      waitUntil: 'load',
    })
    const element = await browser.waitForElementByCss(
      '[data-testid="marker-app-start"]',
      { state: 'attached' }
    )
    expect(await element.evaluate((el: Element) => el.checkVisibility())).toBe(
      true
    )
  })

  it('replaces the default regex', async () => {
    // ClaudeBot is in the default list, but the custom regex replaces it, so
    // its boundaries are only revealed by client JS.
    const browser = await next.browser('/large-boundary', {
      userAgent: NON_JS_BOT,
      disableJavaScript: true,
      waitUntil: 'load',
    })
    const element = await browser.waitForElementByCss(
      '[data-testid="marker-app-start"]',
      { state: 'attached' }
    )
    expect(await element.evaluate((el: Element) => el.checkVisibility())).toBe(
      false
    )
  })
})
