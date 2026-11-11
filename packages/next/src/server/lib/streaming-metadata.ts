import {
  HTML_LIMITED_BOT_UA_RE_STRING,
  isOversizedUserAgent,
} from '../../shared/lib/router/utils/is-bot'
import { NON_JS_BOT_UA_RE_STRING } from '../../shared/lib/router/utils/non-js-bots'

let cachedPattern: string | undefined
let cachedRegex: RegExp | undefined

export function shouldServeStreamingMetadata(
  userAgent: string,
  htmlLimitedBots: string | undefined
): boolean {
  // No real UA string exceeds this bound, so oversized UAs are not bots we need
  // to identify; skip the (possibly user-configured) regex on them entirely.
  if (!userAgent || isOversizedUserAgent(userAgent)) {
    return true
  }
  const pattern = htmlLimitedBots || HTML_LIMITED_BOT_UA_RE_STRING
  if (cachedPattern !== pattern) {
    cachedPattern = pattern
    cachedRegex = new RegExp(pattern, 'i')
  }
  // Only block metadata for HTML-limited bots
  if (cachedRegex!.test(userAgent)) {
    return false
  }
  return true
}

let cachedNonJsBotsPattern: string | undefined
let cachedNonJsBotsRegex: RegExp | undefined

export function shouldDisableProgressiveLoading(
  userAgent: string | null | undefined,
  experimental: {
    disableProgressiveLoadingForNonJsBots?: boolean
    nonJsBots?: string
  }
): boolean {
  if (!experimental.disableProgressiveLoadingForNonJsBots) {
    return false
  }
  // No real UA string exceeds this bound, so oversized UAs are not bots we need
  // to identify; skip the (possibly user-configured) regex on them entirely.
  if (!userAgent || isOversizedUserAgent(userAgent)) {
    return false
  }
  const pattern = experimental.nonJsBots || NON_JS_BOT_UA_RE_STRING
  if (cachedNonJsBotsPattern !== pattern) {
    cachedNonJsBotsPattern = pattern
    cachedNonJsBotsRegex = new RegExp(pattern, 'i')
  }
  return cachedNonJsBotsRegex!.test(userAgent)
}
