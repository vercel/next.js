import { getRequestMeta, type NextIncomingMessage } from '../../request-meta'
import type { ServerComponentsHmrCache } from '../../response-cache'
import type { DevRenderContext } from './module'

/** Capture HMR inputs at the App Page handler boundary in dev. */
export function createDevRenderContext(
  req: NextIncomingMessage,
  hmrCacheFallback?: ServerComponentsHmrCache
): DevRenderContext | undefined {
  if (!process.env.__NEXT_DEV_SERVER) {
    return undefined
  }

  const { serverComponentsHmrCache, hmrRefreshHash } = getRequestMeta(req)
  return {
    serverComponentsHmrCache: serverComponentsHmrCache ?? hmrCacheFallback,
    hmrRefreshHash,
  }
}
