import {
  getBotType,
  HTML_LIMITED_BOT_UA_RE_STRING,
} from '../../shared/lib/router/utils/is-bot'
import type { BaseNextRequest } from '../base-http'

export function shouldServeStreamingMetadata(
  userAgent: string,
  {
    dynamicIO,
    streamingMetadata,
    htmlLimitedBots,
  }: {
    dynamicIO: boolean
    streamingMetadata: boolean
    htmlLimitedBots: string | undefined
  }
): boolean {
  // Disable streaming metadata when dynamic IO is enabled.
  // FIXME: remove dynamic IO guard once we fixed the dynamic indicator case.
  // test/e2e/app-dir/dynamic-io/dynamic-io.test.ts - should not have static indicator on not-found route
  if (!streamingMetadata || dynamicIO) {
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

// When the request UA is a html-limited bot, we should do a dynamic render.
// In this case, postpone state is not sent.
export function isHtmlBotRequest(req: BaseNextRequest): boolean {
  const ua = req.headers['user-agent'] || ''
  const botType = getBotType(ua)

  return botType === 'html'
}
