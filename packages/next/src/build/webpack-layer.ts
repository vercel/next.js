import type { WebpackLayerName } from '../lib/constants'
import { WEBPACK_LAYERS } from '../lib/constants'

export function shouldUseReactServerCondition(
  layer: WebpackLayerName | null | undefined
): boolean {
  return Boolean(
    layer && WEBPACK_LAYERS.GROUP.serverOnly.includes(layer as any)
  )
}

export function isWebpackAppPagesLayer(
  layer: WebpackLayerName | null | undefined
): boolean {
  return Boolean(layer && WEBPACK_LAYERS.GROUP.appPages.includes(layer as any))
}
