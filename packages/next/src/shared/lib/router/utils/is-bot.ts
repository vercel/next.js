import { HTML_LIMITED_BOT_UA_RE } from './html-bots'

export const HTML_LIMITED_BOT_UA_RE_STRING = HTML_LIMITED_BOT_UA_RE.source

export { HTML_LIMITED_BOT_UA_RE }

function isHtmlLimitedBotUA(userAgent: string) {
  return HTML_LIMITED_BOT_UA_RE.test(userAgent)
}

export { isBot } from '../../../../server/web/spec-extension/user-agent'

export function getBotType(userAgent: string): 'html' | undefined {
  if (isHtmlLimitedBotUA(userAgent)) {
    return 'html'
  }
  return undefined
}
