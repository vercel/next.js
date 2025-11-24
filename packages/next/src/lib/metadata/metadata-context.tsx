import type { AppRenderContext } from '../../server/app-render/app-render'
import type { MetadataContext } from './types/resolvers'

export function createMetadataContext(
  renderOpts: AppRenderContext['renderOpts']
): MetadataContext {
  return {
    trailingSlash: renderOpts.trailingSlash,
    isStaticMetadataRouteFile: false,
  }
}
