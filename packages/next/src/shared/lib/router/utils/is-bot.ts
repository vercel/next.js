import { HTML_LIMITED_BOT_UA_RE } from './html-bots'

// Bot crawler that will spin up a headless browser and execute JS.
// Only the main Googlebot search crawler executes JavaScript, not other Google crawlers.
// x-ref: https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers
// This regex specifically matches "Googlebot" but NOT "Mediapartners-Google", "AdsBot-Google", etc.
const HEADLESS_BROWSER_BOT_UA_RE = /Googlebot(?!-)|Googlebot$/i

export const HTML_LIMITED_BOT_UA_RE_STRING = HTML_LIMITED_BOT_UA_RE.source

export { HTML_LIMITED_BOT_UA_RE }

// No known real UA string exceeds ~500 bytes; anything larger is not a bot we
// need to identify. Skipping the regex bounds the work done on attacker-controlled
// input.
export const MAX_USER_AGENT_LENGTH = 1024

function isDomBotUA(userAgent: string) {
  return (
    userAgent.length <= MAX_USER_AGENT_LENGTH &&
    HEADLESS_BROWSER_BOT_UA_RE.test(userAgent)
  )
}

function isHtmlLimitedBotUA(userAgent: string) {
  return (
    userAgent.length <= MAX_USER_AGENT_LENGTH &&
    HTML_LIMITED_BOT_UA_RE.test(userAgent)
  )
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
