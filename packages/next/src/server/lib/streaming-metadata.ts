import {
  getBotType,
  HTML_LIMITED_BOT_UA_RE_STRING,
} from '../../shared/lib/router/utils/is-bot'
import type { BaseNextRequest } from '../base-http'

// Cache compiled RegExp per pattern string to avoid re-creating it on every
// request. The pattern comes from `nextConfig.htmlLimitedBots` which is a
// static config value, so the cache will hold at most 1-2 entries.
let cachedPattern: string | undefined
let cachedRegex: RegExp | undefined

export function shouldServeStreamingMetadata(
  userAgent: string,
  htmlLimitedBots: string | undefined
): boolean {
  const pattern = htmlLimitedBots || HTML_LIMITED_BOT_UA_RE_STRING
  if (pattern !== cachedPattern) {
    cachedPattern = pattern
    cachedRegex = new RegExp(pattern, 'i')
  }
  // Only block metadata for HTML-limited bots
  if (userAgent && cachedRegex!.test(userAgent)) {
    return false
  }
  return true
}

// When the request UA is a html-limited bot, we should do a dynamic render.
// In this case, postpone state is not sent.
export function isHtmlBotRequest(req: {
  headers: BaseNextRequest['headers']
}): boolean {
  const ua = req.headers['user-agent'] || ''
  const botType = getBotType(ua)

  return botType === 'html'
}
