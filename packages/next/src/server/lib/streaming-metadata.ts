import {
  getBotType,
  HTML_LIMITED_BOT_UA_RE_STRING,
} from '../../shared/lib/router/utils/is-bot'
import type { BaseNextRequest } from '../base-http'

export function shouldServeStreamingMetadata(
  userAgent: string,
  {
    streamingMetadata,
    htmlLimitedBots,
  }: {
    streamingMetadata: boolean
    htmlLimitedBots: string | undefined
  }
): boolean {
  if (!streamingMetadata) {
    return false
  }

  const blockingMetadataUARegex = new RegExp(
    htmlLimitedBots || HTML_LIMITED_BOT_UA_RE_STRING,
    'i'
  )
  return (
    // When it's static generation, userAgents are not available - do not serve streaming metadata
    !!userAgent && !blockingMetadataUARegex.test(userAgent)
  )
}

// When streaming metadata is enabled and request UA is a html-limited bot, we should do a dynamic render.
// In this case, postpone state is not sent.
export function shouldSkipPostponedState(
  req: BaseNextRequest,
  streamingMetadata: boolean
): boolean {
  const ua = req.headers['user-agent'] || ''
  const botType = getBotType(ua)

  return botType === 'html' && streamingMetadata
}
