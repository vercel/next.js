import { HTML_LIMITED_BOT_UA_RE } from './html-bots'

// Bot crawler that will spin up a headless browser and execute JS.
// Only the main Googlebot search crawler executes JavaScript, not other Google crawlers.
// x-ref: https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers
// This regex specifically matches "Googlebot" but NOT "Mediapartners-Google", "AdsBot-Google", etc.
const HEADLESS_BROWSER_BOT_UA_RE = /Googlebot(?!-)|Googlebot$/i

export const HTML_LIMITED_BOT_UA_RE_STRING = HTML_LIMITED_BOT_UA_RE.source

export { HTML_LIMITED_BOT_UA_RE }

function isDomBotUA(userAgent: string) {
  return HEADLESS_BROWSER_BOT_UA_RE.test(userAgent)
}

function isHtmlLimitedBotUA(userAgent: string) {
  return HTML_LIMITED_BOT_UA_RE.test(userAgent)
}

export function isBot(userAgent: string): boolean {
  return isDomBotUA(userAgent) || isHtmlLimitedBotUA(userAgent)
}

export function getBotType(userAgent: string): 'dom' | 'html' | undefined {
  if (isDomBotUA(userAgent)) {
    return 'dom'
  }
  if (isHtmlLimitedBotUA(userAgent)) {
    return 'html'
  }
  return undefined
}
