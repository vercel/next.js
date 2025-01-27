import { HTML_LIMITED_BOT_UA_RE_STRING } from '../../shared/lib/router/utils/is-bot'

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
