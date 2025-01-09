import { HTML_LIMITED_BOT_UA_RE } from '../../shared/lib/router/utils/is-bot'

export function shouldServeStreamingMetadata(
  userAgent: string,
  {
    streamingMetadata,
    htmlLimitedBots,
  }: {
    streamingMetadata: boolean
    htmlLimitedBots: RegExp | undefined
  }
): boolean {
  if (!streamingMetadata) {
    return false
  }

  const blockingMetadataUARegex = htmlLimitedBots || HTML_LIMITED_BOT_UA_RE
  return !blockingMetadataUARegex.test(userAgent)
}
