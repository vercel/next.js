import type { CompiledTestRequestContext } from '../contracts'
import type { WorkStoreContext } from '../../../server/async-storage/work-store'
import { IncrementalCache } from '../../../server/lib/incremental-cache'

type CompiledRenderOpts = CompiledTestRequestContext['renderOpts']

/** Live request fields that cannot be supplied by compiler metadata. */
export type CompiledRequestRuntimeContext = Omit<
  WorkStoreContext,
  'buildId' | 'deploymentId' | 'renderOpts'
> & {
  renderOpts: Omit<
    WorkStoreContext['renderOpts'],
    keyof CompiledRenderOpts | 'incrementalCache'
  > & {
    incrementalCache: IncrementalCache
    experimental: Omit<
      WorkStoreContext['renderOpts']['experimental'],
      keyof CompiledRenderOpts['experimental']
    >
  }
}

/**
 * Combine authoritative compiler configuration with live request resources.
 * This is a dynamic subtree context, not a route prerender context.
 * The caller owns the supplied cache's lifetime; this does not create a cold
 * cache, reset shared state, or establish route/cache isolation.
 */
export function createCompiledRequestWorkContext(
  metadata: CompiledTestRequestContext | undefined,
  runtimeContext: CompiledRequestRuntimeContext
): WorkStoreContext {
  if (!metadata) {
    throw new Error(
      'Compiled request rendering requires resolved requestContext metadata.'
    )
  }
  if (
    !(runtimeContext.renderOpts.incrementalCache instanceof IncrementalCache)
  ) {
    throw new Error(
      'Compiled request rendering requires a real runtime IncrementalCache with an explicitly owned lifetime.'
    )
  }
  if (!runtimeContext.renderOpts.incrementalCache.cacheHandler) {
    throw new Error(
      'Compiled request rendering requires an initialized cache handler.'
    )
  }
  if (metadata.mode !== 'development' && metadata.mode !== 'production') {
    throw new Error(
      'Compiled request rendering requires resolved compiler mode.'
    )
  }
  if (
    runtimeContext.renderOpts.incrementalCache.dev !==
    (metadata.mode === 'development')
  ) {
    throw new Error(
      'Compiled request rendering requires an IncrementalCache matching its compiler mode.'
    )
  }
  if (runtimeContext.renderOpts.isBuildTimePrerendering) {
    throw new Error('Compiled request rendering does not support prerendering.')
  }
  if (runtimeContext.renderOpts.experimental.isRoutePPREnabled) {
    throw new Error('Compiled request rendering does not support route PPR.')
  }

  return {
    ...runtimeContext,
    buildId: metadata.buildId,
    deploymentId: metadata.deploymentId,
    renderOpts: {
      ...runtimeContext.renderOpts,
      ...metadata.renderOpts,
      experimental: {
        ...runtimeContext.renderOpts.experimental,
        ...metadata.renderOpts.experimental,
      },
    },
  }
}
