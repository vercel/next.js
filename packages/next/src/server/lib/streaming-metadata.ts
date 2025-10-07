import {
  getBotType,
  HTML_LIMITED_BOT_UA_RE_STRING,
} from '../../shared/lib/router/utils/is-bot'
import type { BaseNextRequest } from '../base-http'

export function shouldServeStreamingMetadata(
  userAgent: string,
  htmlLimitedBots: string | undefined
): boolean {
  const blockingMetadataUARegex = new RegExp(
    htmlLimitedBots || HTML_LIMITED_BOT_UA_RE_STRING,
    'i'
  )
  // Only block metadata for HTML-limited bots
  if (userAgent && blockingMetadataUARegex.test(userAgent)) {
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
