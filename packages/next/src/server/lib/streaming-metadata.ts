import { HTML_LIMITED_BOT_UA_ARRAY } from '../../shared/lib/router/utils/is-bot'

export function shouldServeStreamingMetadata(
  userAgent: string,
  {
    streamingMetadata,
    htmlLimitedBots,
  }: {
    streamingMetadata: boolean
    htmlLimitedBots: string[] | undefined
  }
): boolean {
  if (!streamingMetadata) {
    return false
  }

  const blockingMetadataUARegex = new RegExp(
    (htmlLimitedBots || HTML_LIMITED_BOT_UA_ARRAY).join('|'),
    'i'
  )
  return !blockingMetadataUARegex.test(userAgent)
}
