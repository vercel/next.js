/**
 * Webpack layer utilities - split from build/utils.ts to avoid pulling in heavy dependencies
 * during dev server boot. These functions only depend on WEBPACK_LAYERS from constants.
 */
import type { WebpackLayerName } from '../lib/constants'
import { WEBPACK_LAYERS } from '../lib/constants'

export function shouldUseReactServerCondition(
  layer: WebpackLayerName | null | undefined
): boolean {
  return Boolean(
    layer && WEBPACK_LAYERS.GROUP.serverOnly.includes(layer as any)
  )
}

export function isWebpackClientOnlyLayer(
  layer: WebpackLayerName | null | undefined
): boolean {
  return Boolean(
    layer && WEBPACK_LAYERS.GROUP.clientOnly.includes(layer as any)
  )
}

export function isWebpackDefaultLayer(
  layer: WebpackLayerName | null | undefined
): boolean {
  return (
    layer === null ||
    layer === undefined ||
    layer === WEBPACK_LAYERS.pagesDirBrowser ||
    layer === WEBPACK_LAYERS.pagesDirEdge ||
    layer === WEBPACK_LAYERS.pagesDirNode
  )
}

export function isWebpackBundledLayer(
  layer: WebpackLayerName | null | undefined
): boolean {
  return Boolean(layer && WEBPACK_LAYERS.GROUP.bundled.includes(layer as any))
}

export function isWebpackAppPagesLayer(
  layer: WebpackLayerName | null | undefined
): boolean {
  return Boolean(layer && WEBPACK_LAYERS.GROUP.appPages.includes(layer as any))
}
