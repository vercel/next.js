import { chromium, firefox, webkit, type Browser } from 'playwright'

function getFullUrl(appPortOrUrl: string | number, url: string): string {
  const appUrl =
    typeof appPortOrUrl === 'string'
      ? appPortOrUrl
      : `http://localhost:${appPortOrUrl}`
  return url.startsWith('/') ? `${appUrl}${url}` : url
}

/**
 * Minimal standalone browser session launcher for testing multiple concurrent browser tabs.
 * The standard test harness (next.browser) uses a singleton browser instance which doesn't
 * support concurrent tabs needed for testing errors across multiple browser sessions.
 */
export async function launchStandaloneSession(
  appPortOrUrl: string | number,
  url: string
) {
  const headless = !!process.env.HEADLESS
  const browserName = (process.env.BROWSER_NAME || 'chrome').toLowerCase()
  let browser: Browser
  if (browserName === 'safari') {
    browser = await webkit.launch({ headless })
  } else if (browserName === 'firefox') {
    browser = await firefox.launch({ headless })
  } else {
    browser = await chromium.launch({ headless })
  }
  const context = await browser.newContext()
  const page = await context.newPage()
  const fullUrl = getFullUrl(appPortOrUrl, url)
  await page.goto(fullUrl, { waitUntil: 'load' })
  return {
    page,
    close: async () => {
      await page.close().catch(() => {})
      await context.close().catch(() => {})
      await browser.close().catch(() => {})
    },
  }
}
