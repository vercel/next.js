import type { MetadataContext } from './types/resolvers'

export function createMetadataContext(): MetadataContext {
  return {
    isStaticMetadataRouteFile: false,
  }
}
