import { BOT_UA_RE } from './bots'

export const HTML_LIMITED_BOT_UA_RE_STRING = BOT_UA_RE.source

// Treat all bots as html-limited bots
export { BOT_UA_RE as HTML_LIMITED_BOT_UA_RE }

export function isBot(userAgent: string) {
  return BOT_UA_RE.test(userAgent)
}

export function getBotType(userAgent: string): 'html' | undefined {
  if (isBot(userAgent)) {
    return 'html'
  }
  return undefined
}
