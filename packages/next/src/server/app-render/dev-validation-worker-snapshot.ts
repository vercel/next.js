import type { AppRenderContext, ResolvedValidationInputs } from './app-render'
import type { PrefetchingMode } from './app-render'
import type { OpaqueFallbackRouteParams } from '../request/fallback-params'
import type { AnyStream } from './stream-ops'
import type {
  DevValidationSnapshot,
  SerializedValidationInputs,
} from './dev-validation-worker-globals'

import { isNodeNextResponse } from '../base-http/helpers'

/**
 * Builds the serializable snapshot the dev validation worker needs to rebuild
 * the render context and inputs and run `runValidationInDev` on the worker
 * thread. Reads only serializable data from the settled render; the live
 * objects (`componentMod`, the async-storage stores,
 * `getDynamicParamFromSegment`) are reconstructed on the worker from this seed.
 * Draining the debug channels is async, so this returns a promise.
 */
export async function buildDevValidationSnapshot(
  ctx: AppRenderContext,
  instantInputs: ResolvedValidationInputs | null,
  staticInputs: ResolvedValidationInputs,
  prefetchMode: PrefetchingMode,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  devRenderDidError: boolean
): Promise<DevValidationSnapshot> {
  const requestStore = staticInputs.requestStore
  const responseFinished =
    !isNodeNextResponse(ctx.res) || ctx.res.originalResponse.writableFinished

  // The instant and static inputs may share one debug channel, so drain each
  // channel only once.
  const chunksByChannel = new WeakMap<AnyStream, Uint8Array[]>()
  const getDebugChunksOnce = async (
    channel: AnyStream | undefined
  ): Promise<Uint8Array[] | null> => {
    if (!channel) {
      return null
    }
    let chunks = chunksByChannel.get(channel)
    if (!chunks) {
      chunks = []
      for await (const chunk of channel) {
        chunks.push(chunk)
      }
      chunksByChannel.set(channel, chunks)
    }
    return chunks
  }

  const toSerializedInputs = async (
    inputs: ResolvedValidationInputs
  ): Promise<SerializedValidationInputs> => ({
    accumulatedChunks: inputs.accumulatedChunks,
    debugChunks: await getDebugChunksOnce(inputs.debugChannelClient),
    startTime: inputs.startTime,
    stageEndTimes: inputs.stageEndTimes,
  })

  return {
    page: ctx.workStore.page,
    route: ctx.workStore.route,
    requestId: ctx.requestId,
    responseFinished,
    prefetchMode,
    devRenderDidError,
    nonce: ctx.nonce,
    query: ctx.query,
    request: {
      headers: [...requestStore.headers.entries()],
      urlPathname: requestStore.url.pathname,
      urlSearch: requestStore.url.search,
      rootParams: requestStore.rootParams,
      isDraftMode: requestStore.draftMode.isEnabled,
      isHmrRefresh: requestStore.isHmrRefresh ?? false,
      hmrRefreshHash: requestStore.hmrRefreshHash,
      requestStartTime: ctx.workStore.requestStartTime,
    },
    interpolatedParams: ctx.interpolatedParams,
    requestFallbackRouteParams: ctx.fallbackRouteParams,
    fallbackRouteParams,
    optimisticRouting: ctx.renderOpts.experimental.optimisticRouting,
    forceStatic: ctx.workStore.forceStatic,
    validationLevel: ctx.workStore.validationLevel,
    implicitTags: ctx.implicitTags.tags,
    additionalClientReferenceManifestPages: ctx.workStore
      .additionalClientReferenceManifestPages
      ? [...ctx.workStore.additionalClientReferenceManifestPages]
      : [],
    reactBrowserBailout: ctx.renderOpts.experimental.reactBrowserBailout,
    isDebugChannelEnabled: !!ctx.renderOpts.setReactDebugChannel,
    renderOpts: {
      images: ctx.renderOpts.images,
      allowEmptyStaticShell: ctx.renderOpts.allowEmptyStaticShell,
    },
    instantInputs: instantInputs
      ? await toSerializedInputs(instantInputs)
      : null,
    staticInputs: await toSerializedInputs(staticInputs),
  }
}
