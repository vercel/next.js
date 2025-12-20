import type { AppRenderContext } from '../../server/app-render/app-render'
import type { MetadataContextWithBasePath } from './types/resolvers'


export function createMetadataContext(
  renderOpts: AppRenderContext['renderOpts']
): MetadataContextWithBasePath {
  return {
    trailingSlash: renderOpts.trailingSlash,
    isStaticMetadataRouteFile: false,
    basePath: renderOpts.basePath,
  }
}

