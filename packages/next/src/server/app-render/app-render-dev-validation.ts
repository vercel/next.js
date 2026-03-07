import type { Readable } from 'node:stream'
import type { ErrorInfo } from 'react'

import type { AppRenderContext, AccumulatedStreamChunks } from './app-render'
import type {
  RequestStore,
  PrerenderStoreModernClient,
  ValidationStoreClient,
} from './work-unit-async-storage.external'
import type { OpaqueFallbackRouteParams } from '../request/fallback-params'
import type { Params } from '../request/params'
import type { ValidationBoundaryTracking } from './instant-validation/boundary-tracking'

import { getDigestForWellKnownError } from './create-error-handler'
import { CacheSignal } from './cache-signal'
import {
  createDynamicTrackingState,
  createDynamicValidationState,
  createInstantValidationState,
  DynamicHoleKind,
  getNavigationDisallowedDynamicReasons,
  getStaticShellDisallowedDynamicReasons,
  isPrerenderInterruptedError,
  PreludeState,
  trackDynamicHoleInNavigation,
  trackDynamicHoleInRuntimeShell,
  trackDynamicHoleInStaticShell,
  trackThrownErrorInNavigation,
} from './dynamic-rendering'
import { getClientReferenceManifest } from './manifests-singleton'
import { createServerInsertedHTML } from './server-inserted-html'
import { processPrelude as processPreludeOp } from './stream-ops'
import { getRootParams } from './create-component-tree'
import { isReactLargeShellError } from './react-large-shell-error'
import { createNodeStreamWithLateRelease } from './instant-validation/stream-utils'
import { createValidationBoundaryTracking } from './instant-validation/boundary-tracking'
import {
  type CreateClientPrerenderApp,
  createClientPrerenderStore,
  runClientPrerenderPass,
  warmupProspectiveClientPrerender,
} from './app-render-client-prerender'
import { RenderStage } from './staged-rendering'
import {
  anySegmentNeedsInstantValidation,
  isPageAllowedToBlock,
} from './instant-validation/instant-config'
import { getHmrRefreshHash } from './work-unit-async-storage.external'
import type { DebugChannelPair } from './debug-channel-server'
import { consoleAsyncStorage } from './console-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'

type TrackDynamicHole = (
  workStore: AppRenderContext['workStore'],
  componentStack: string,
  dynamicValidation: ReturnType<typeof createDynamicValidationState>,
  clientDynamicTracking: ReturnType<typeof createDynamicTrackingState>
) => void

type SendValidationErrors = (messages: Array<unknown>) => Promise<void>
type ValidationLifecycleContext = Pick<AppRenderContext, 'requestId' | 'url'>

type StaticShellValidationInDevOptions = {
  accumulatedChunksPromise: Promise<AccumulatedStreamChunks>
  syncInterruptReason: Error | null
  startTime: number
  staticStageEndTime: number
  runtimeStageEndTime: number
  ctx: AppRenderContext
  requestStore: RequestStore
  fallbackRouteParams: OpaqueFallbackRouteParams | null
  debugChannelClient: Readable | undefined
  createApp: CreateClientPrerenderApp
  sendValidationErrors: SendValidationErrors
}

function logValidationLifecycleEvent(
  type: 'validation_start' | 'validation_end',
  ctx: ValidationLifecycleContext
) {
  console.log(
    '<VALIDATION_MESSAGE>' +
      JSON.stringify({ type, requestId: ctx.requestId, url: ctx.url.href }) +
      '</VALIDATION_MESSAGE>'
  )
}

async function withValidationLifecycleLogs<T>(
  ctx: ValidationLifecycleContext,
  callback: () => Promise<T>
): Promise<T> {
  if (process.env.__NEXT_TEST_MODE && process.env.NEXT_TEST_LOG_VALIDATION) {
    logValidationLifecycleEvent('validation_start', ctx)
    try {
      return await callback()
    } finally {
      logValidationLifecycleEvent('validation_end', ctx)
    }
  }

  return await callback()
}

export function logValidationSkipped(ctx: ValidationLifecycleContext) {
  if (process.env.__NEXT_TEST_MODE && process.env.NEXT_TEST_LOG_VALIDATION) {
    logValidationLifecycleEvent('validation_start', ctx)
    logValidationLifecycleEvent('validation_end', ctx)
  }
}

export function spawnStaticShellValidationInDevIfNeeded({
  shouldValidate,
  debugChannel,
  accumulatedChunksPromise,
  syncInterruptReason,
  startTime,
  staticStageEndTime,
  runtimeStageEndTime,
  ctx,
  requestStore,
  fallbackRouteParams,
  createApp,
  sendValidationErrors,
}: {
  shouldValidate: boolean
  debugChannel: DebugChannelPair | undefined
  accumulatedChunksPromise: Promise<AccumulatedStreamChunks>
  syncInterruptReason: Error | null
  startTime: number
  staticStageEndTime: number
  runtimeStageEndTime: number
  ctx: AppRenderContext
  requestStore: RequestStore
  fallbackRouteParams: OpaqueFallbackRouteParams | null
  createApp: CreateClientPrerenderApp
  sendValidationErrors: SendValidationErrors
}) {
  if (!shouldValidate) {
    logValidationSkipped(ctx)
    return
  }

  let debugChannelClient: Readable | undefined = undefined
  if (debugChannel) {
    const [t1, t2] = debugChannel.clientSide.readable.tee()
    debugChannel.clientSide.readable = t1
    debugChannelClient = nodeStreamFromReadableStream(t2)
  }

  consoleAsyncStorage.run({ dim: true }, spawnStaticShellValidationInDev, {
    accumulatedChunksPromise,
    syncInterruptReason,
    startTime,
    staticStageEndTime,
    runtimeStageEndTime,
    ctx,
    requestStore,
    fallbackRouteParams,
    debugChannelClient,
    createApp,
    sendValidationErrors,
  })
}

async function spawnStaticShellValidationInDev(
  options: StaticShellValidationInDevOptions
): Promise<void> {
  return withValidationLifecycleLogs(options.ctx, () =>
    runStaticShellValidationInDev(options)
  )
}

/**
 * Validates the static shell produced by the dev render. This follows the
 * same warmup → prerender → check sequence as prerenderToStream's
 * cacheComponents branch, sharing the core mechanics via
 * runClientPrerenderPass and createClientPrerenderStore. The key differences
 * from the production path are intentional:
 *
 * - Input: replays pre-captured byte arrays instead of rendering RSC from scratch
 * - Two-pass: runs the client prerender twice (runtime stage, then static stage)
 * - Tracking: uses trackDynamicHoleIn{Runtime,Static}Shell instead of trackAllowedDynamicAccess
 * - Errors: returns an error array instead of throwing StaticGenBailoutError
 * - Output: discards the HTML (only checks preludeIsEmpty)
 */
async function runStaticShellValidationInDev({
  accumulatedChunksPromise,
  syncInterruptReason,
  startTime,
  staticStageEndTime,
  runtimeStageEndTime,
  ctx,
  requestStore,
  fallbackRouteParams,
  debugChannelClient,
  createApp,
  sendValidationErrors,
}: StaticShellValidationInDevOptions): Promise<void> {
  const debug =
    process.env.NEXT_PRIVATE_DEBUG_VALIDATION === '1' ? console.log : undefined

  const {
    componentMod: ComponentMod,
    getDynamicParamFromSegment,
    renderOpts,
    workStore,
  } = ctx

  const loaderTree = ComponentMod.routeModule.userland.loaderTree

  const allowEmptyStaticShell =
    (renderOpts.allowEmptyStaticShell ?? false) ||
    (await isPageAllowedToBlock(loaderTree))

  const rootParams = getRootParams(loaderTree, getDynamicParamFromSegment)

  const hmrRefreshHash = getHmrRefreshHash(requestStore)

  // We don't need to continue the prerender process if we already
  // detected invalid dynamic usage in the initial prerender phase.
  const { invalidDynamicUsageError } = workStore
  if (invalidDynamicUsageError) {
    return sendValidationErrors([invalidDynamicUsageError])
  }

  if (syncInterruptReason) {
    return sendValidationErrors([syncInterruptReason])
  }

  let debugChunks: Uint8Array[] | null = null
  if (debugChannelClient) {
    debugChunks = []
    debugChannelClient.on('data', (c) => {
      debugChunks!.push(c)
    })
  }

  const accumulatedChunks = await accumulatedChunksPromise
  const { staticChunks, runtimeChunks, dynamicChunks } = accumulatedChunks

  const needsInstantValidation =
    await anySegmentNeedsInstantValidation(loaderTree)

  // First we warmup SSR with the runtime chunks. This ensures that when we do
  // the full prerender pass with dynamic tracking module loading won't
  // interrupt the prerender and can properly observe the entire content
  await warmupClientModulesForStagedValidationInDev(
    // if we're going to be validating prefetches, we'll be rendering some segments in the dynamic stage.
    // otherwise, for static shell validation, we only need to warm up to the runtime stage.
    // we also need to use a different store type, because instant validation allows more APIs to resolve.
    needsInstantValidation ? 'validation-client' : 'prerender-client',
    needsInstantValidation ? dynamicChunks : runtimeChunks,
    dynamicChunks,
    rootParams,
    fallbackRouteParams,
    allowEmptyStaticShell,
    ctx,
    createApp
  )

  debug?.(`Starting static shell validation...`)

  const runtimeResult = await validateStagedShell(
    runtimeChunks,
    dynamicChunks,
    debugChunks,
    runtimeStageEndTime,
    rootParams,
    fallbackRouteParams,
    allowEmptyStaticShell,
    ctx,
    hmrRefreshHash,
    trackDynamicHoleInRuntimeShell,
    createApp
  )

  if (runtimeResult.length > 0) {
    debug?.(`❌ Failed - ${runtimeResult.length} errors from runtime stage`)
    // We have something to report from the runtime validation
    // We can skip the rest
    return sendValidationErrors(runtimeResult)
  }

  const staticResult = await validateStagedShell(
    staticChunks,
    dynamicChunks,
    debugChunks,
    staticStageEndTime,
    rootParams,
    fallbackRouteParams,
    allowEmptyStaticShell,
    ctx,
    hmrRefreshHash,
    trackDynamicHoleInStaticShell,
    createApp
  )

  if (staticResult.length > 0) {
    debug?.(`❌ Failed - ${staticResult.length} errors from static stage`)
    // We have something to report from the static validation
    // We can skip the rest
    return sendValidationErrors(staticResult)
  }
  debug?.(`✅ Passed`)

  if (needsInstantValidation) {
    const instantConfigsResult = await validateInstantConfigs(
      accumulatedChunks,
      debugChunks,
      startTime,
      rootParams,
      ctx,
      hmrRefreshHash,
      createApp
    )

    if (instantConfigsResult.length > 0) {
      return sendValidationErrors(instantConfigsResult)
    }
  }
}

async function warmupClientModulesForStagedValidationInDev(
  storeType: PrerenderStoreModernClient['type'] | ValidationStoreClient['type'],
  partialServerChunks: Array<Uint8Array>,
  allServerChunks: Array<Uint8Array>,
  rootParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  allowEmptyStaticShell: boolean,
  ctx: AppRenderContext,
  createApp: CreateClientPrerenderApp
) {
  const { implicitTags, workStore } = ctx

  // Warmup SSR
  const initialClientPrerenderController = new AbortController()
  const initialClientReactController = new AbortController()
  const initialClientRenderController = new AbortController()

  const { ServerInsertedHTMLProvider } = createServerInsertedHTML()

  const initialClientPrerenderStore =
    storeType === 'prerender-client'
      ? createClientPrerenderStore({
          storeType,
          rootParams,
          fallbackRouteParams,
          implicitTags,
          renderController: initialClientRenderController,
          controller: initialClientPrerenderController,
          allowEmptyStaticShell,
          dynamicTracking: null,
          prerenderResumeDataCache: null,
          renderResumeDataCache: null,
          hmrRefreshHash: undefined,
        })
      : createClientPrerenderStore({
          storeType,
          rootParams,
          implicitTags,
          renderController: initialClientRenderController,
          controller: initialClientPrerenderController,
          dynamicTracking: null,
          hmrRefreshHash: undefined,
          boundaryState: null,
        })

  // TODO: maybe conditionally switch between runtime chunks and all chunks?
  // but warming too much should always be fine, just not always necessary
  const serverStream = createNodeStreamWithLateRelease(
    partialServerChunks,
    allServerChunks,
    initialClientReactController.signal
  )

  // This is mostly needed for dynamic `import()`s in client components.
  // Promises passed to client were already awaited above (assuming that they came from cached functions)
  await warmupProspectiveClientPrerender({
    prerenderStore: initialClientPrerenderStore,
    reactController: initialClientReactController,
    renderController: initialClientRenderController,
    app: createApp({
      reactServerStream: serverStream,
      ServerInsertedHTMLProvider,
    }),
    options: {
      // We don't need bootstrap scripts in this prerender
      // bootstrapScripts: [bootstrapScript],
    },
    cacheSignal: new CacheSignal(),
    workStore,
  })
}

async function validateStagedShell(
  stageChunks: Array<Uint8Array>,
  allServerChunks: Array<Uint8Array>,
  debugChunks: null | Array<Uint8Array>,
  debugEndTime: number | undefined,
  rootParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  allowEmptyStaticShell: boolean,
  ctx: AppRenderContext,
  hmrRefreshHash: string | undefined,
  trackDynamicHole: TrackDynamicHole,
  createApp: CreateClientPrerenderApp
): Promise<Array<unknown>> {
  const { implicitTags, workStore } = ctx

  const clientDynamicTracking = createDynamicTrackingState(
    false //isDebugDynamicAccesses
  )

  const dynamicValidation = createDynamicValidationState()

  try {
    let { prelude: unprocessedPrelude } = await runClientPrerenderPass({
      setup: ({
        reactController,
        renderController,
        ServerInsertedHTMLProvider,
      }) => {
        const prerenderStore = createClientPrerenderStore({
          storeType: 'prerender-client',
          rootParams,
          fallbackRouteParams,
          implicitTags,
          renderController,
          controller: reactController,
          allowEmptyStaticShell,
          dynamicTracking: clientDynamicTracking,
          prerenderResumeDataCache: null,
          renderResumeDataCache: null,
          hmrRefreshHash,
        })

        const serverStream = createNodeStreamWithLateRelease(
          stageChunks,
          allServerChunks,
          reactController.signal
        )

        const debugChannelClient = debugChunks
          ? createNodeStreamWithLateRelease(
              debugChunks,
              debugChunks,
              reactController.signal
            )
          : undefined

        return {
          prerenderStore,
          app: createApp({
            reactServerStream: serverStream,
            reactDebugStream: debugChannelClient,
            debugEndTime,
            ServerInsertedHTMLProvider,
          }),
          options: {
            onError: (err: unknown, errorInfo: ErrorInfo) => {
              if (
                isPrerenderInterruptedError(err) ||
                reactController.signal.aborted
              ) {
                const componentStack = errorInfo.componentStack
                if (typeof componentStack === 'string') {
                  trackDynamicHole(
                    workStore,
                    componentStack,
                    dynamicValidation,
                    clientDynamicTracking
                  )
                }
                return
              }

              if (isReactLargeShellError(err)) {
                // TODO: Aggregate
                console.error(err)
                return undefined
              }

              return getDigestForWellKnownError(err)
            },
            // We don't need bootstrap scripts in this prerender
            // bootstrapScripts: [bootstrapScript],
          },
        }
      },
    })

    const { preludeIsEmpty } = await processPreludeOp(unprocessedPrelude)
    return getStaticShellDisallowedDynamicReasons(
      workStore,
      preludeIsEmpty ? PreludeState.Empty : PreludeState.Full,
      dynamicValidation,
      // TODO(instant-validation): if allowEmptyStaticShell is true (likely due to blocking configs),
      // we should probably just skip this altogether
      allowEmptyStaticShell
    )
  } catch (thrownValue) {
    // Even if the root errors we still want to report any cache components errors
    // that were discovered before the root errored.
    let errors: Array<unknown> = getStaticShellDisallowedDynamicReasons(
      workStore,
      PreludeState.Errored,
      dynamicValidation,
      // TODO(instant-validation): if allowEmptyStaticShell is true (likely due to blocking configs),
      // we should probably just skip this altogether
      allowEmptyStaticShell
    )

    if (process.env.NEXT_DEBUG_BUILD || process.env.__NEXT_VERBOSE_LOGGING) {
      errors.unshift(
        'During dynamic validation the root of the page errored. The next logged error is the thrown value. It may be a duplicate of errors reported during the normal development mode render.',
        thrownValue
      )
    }

    return errors
  }
}

/**
 * Validates instant configs by iterating URL depths from deepest to
 * shallowest. At each depth, builds a combined payload where segments
 * above the boundary use Dynamic stage (already mounted) and segments
 * below use Static/Runtime stage (being prefetched). If the new subtree
 * contains any `unstable_instant` configs, the payload is rendered to
 * detect dynamic holes without Suspense.
 */
async function validateInstantConfigs(
  accumulatedChunks: AccumulatedStreamChunks,
  debugChunks: null | Array<Uint8Array>,
  startTime: number,
  rootParams: Params,
  ctx: AppRenderContext,
  hmrRefreshHash: string | undefined,
  createApp: CreateClientPrerenderApp
): Promise<Array<unknown>> {
  const debug =
    process.env.NEXT_PRIVATE_DEBUG_VALIDATION === '1' ? console.log : undefined

  const {
    createCombinedPayloadAtDepth,
    createCombinedPayloadStream,
    collectStagedSegmentData,
  } = ctx.componentMod.InstantValidation!

  debug?.('\nStarting depth-based instant validation...')

  const loaderTree = ctx.componentMod.routeModule.userland.loaderTree

  // Only affects a debug environment name label, not functional behavior.
  const hasRuntimePrefetch = true

  const clientReferenceManifest = getClientReferenceManifest()

  const {
    cache,
    payload: initialRscPayload,
    stageEndTimes,
  } = await collectStagedSegmentData(
    {
      [RenderStage.Static]: accumulatedChunks.staticChunks,
      [RenderStage.Runtime]: accumulatedChunks.runtimeChunks,
      [RenderStage.Dynamic]: accumulatedChunks.dynamicChunks,
    },
    debugChunks,
    startTime,
    hasRuntimePrefetch,
    clientReferenceManifest
  )

  const { implicitTags, workStore } = ctx
  const isDebugChannelEnabled = !!ctx.renderOpts.setReactDebugChannel

  async function validateAtDepth(
    depth: number
  ): Promise<Array<unknown> | null> {
    return validateAtDepthImpl(depth, null)
  }

  async function validateAtDepthImpl(
    depth: number,
    previousBoundaryState: null | ValidationBoundaryTracking
  ): Promise<null | Array<unknown>> {
    const extraChunksController = new AbortController()

    const boundaryState = createValidationBoundaryTracking()
    let useRuntimeStageForPartialSegments = false
    if (previousBoundaryState) {
      // We're doing a followup render to better discriminate error types
      useRuntimeStageForPartialSegments = true
      for (const id of previousBoundaryState.expectedIds) {
        boundaryState.expectedIds.add(id)
      }
    }

    const payloadResult = await createCombinedPayloadAtDepth(
      initialRscPayload,
      cache,
      loaderTree,
      ctx.getDynamicParamFromSegment,
      ctx.query,
      depth,
      extraChunksController.signal,
      boundaryState,
      clientReferenceManifest,
      stageEndTimes,
      useRuntimeStageForPartialSegments
    )

    if (payloadResult === null) {
      return null
    }

    const dynamicValidation = createInstantValidationState(
      payloadResult.createInstantStack
    )
    const clientDynamicTracking = createDynamicTrackingState(false)

    let errors: Array<unknown>
    try {
      const { prelude: unprocessedPrelude } = await runClientPrerenderPass({
        setup: async ({
          reactController,
          renderController,
          ServerInsertedHTMLProvider,
        }) => {
          const { stream: serverStream, debugStream } =
            await createCombinedPayloadStream(
              payloadResult.payload,
              extraChunksController,
              reactController.signal,
              clientReferenceManifest,
              startTime,
              isDebugChannelEnabled
            )

          return {
            prerenderStore: createClientPrerenderStore({
              storeType: 'validation-client',
              rootParams,
              implicitTags,
              renderController,
              controller: reactController,
              dynamicTracking: clientDynamicTracking,
              hmrRefreshHash,
              boundaryState,
            }),
            app: createApp({
              reactServerStream: serverStream,
              reactDebugStream: debugStream ?? undefined,
              ServerInsertedHTMLProvider,
            }),
            options: {
              onError: (err: unknown, errorInfo: ErrorInfo) => {
                if (
                  isPrerenderInterruptedError(err) ||
                  reactController.signal.aborted
                ) {
                  const componentStack = errorInfo.componentStack
                  if (typeof componentStack === 'string') {
                    trackDynamicHoleInNavigation(
                      workStore,
                      componentStack,
                      dynamicValidation,
                      clientDynamicTracking,
                      payloadResult.hasAmbiguousErrors
                        ? DynamicHoleKind.Runtime
                        : DynamicHoleKind.Dynamic,
                      boundaryState
                    )
                  }
                  return
                } else if (!reactController.signal.aborted) {
                  const componentStack = errorInfo.componentStack
                  if (typeof componentStack === 'string') {
                    trackThrownErrorInNavigation(
                      dynamicValidation,
                      err,
                      componentStack
                    )
                  }
                }

                if (isReactLargeShellError(err)) {
                  console.error(err)
                  return undefined
                }

                return getDigestForWellKnownError(err)
              },
            },
          }
        },
      })

      const { preludeIsEmpty } = await processPreludeOp(unprocessedPrelude)

      errors = getNavigationDisallowedDynamicReasons(
        workStore,
        preludeIsEmpty ? PreludeState.Empty : PreludeState.Full,
        dynamicValidation,
        boundaryState
      )
    } catch (thrownValue) {
      errors = getNavigationDisallowedDynamicReasons(
        workStore,
        PreludeState.Errored,
        dynamicValidation,
        boundaryState
      )

      if (process.env.NEXT_DEBUG_BUILD || process.env.__NEXT_VERBOSE_LOGGING) {
        // TODO(instant-validation) we should switch to pushing an Error with a cause of the
        // thrownValue. Since we want to report the issue to code that largely expects
        // Error objects we should aim to provide this whereever possible
        errors.unshift(
          'During dynamic validation the root of the page errored.',
          thrownValue
        )
      }
    }

    if (errors === null || errors.length === 0) {
      // This prerender did not produce any errors
      return null
    }

    if (previousBoundaryState === null && payloadResult.hasAmbiguousErrors) {
      // This is the first validation attempt. we prepared a payload where dynamic holes might be runtime data dependencies
      // or dynamic data dependencies. We do a followup validation using a payload with only Runtime segments to discriminate
      const dynamicOnlyErrors = await validateAtDepthImpl(depth, boundaryState)

      if (dynamicOnlyErrors !== null && dynamicOnlyErrors.length > 0) {
        // The dynamic errors only validation found errors to report so we favor those
        return dynamicOnlyErrors
      }
    }

    // If we didn't return some other errors at this point the only thing to return is this validation's errors
    return errors
  }

  const urlSegments = ctx.url.pathname.split('/').filter(Boolean)
  const maxDepth = urlSegments.length + 1 // +1 for root

  for (let depth = maxDepth - 1; depth >= 0; depth--) {
    debug?.(`Trying depth ${depth}...`)

    const errors = await validateAtDepth(depth)

    if (errors === null) {
      debug?.(`  No config at depth ${depth}, skipping.`)
      continue
    }

    if (errors.length > 0) {
      debug?.(`  Depth ${depth}: ❌ Failed (${errors.length} errors)`)
      return errors
    }

    debug?.(`  Depth ${depth}: ✅ Passed`)
  }

  debug?.(`✅ All depths passed`)
  return []
}

function nodeStreamFromReadableStream<T>(stream: ReadableStream<T>) {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      'nodeStreamFromReadableStream cannot be used in the edge runtime'
    )
  } else {
    const reader = stream.getReader()

    const { Readable } = require('node:stream') as typeof import('node:stream')

    return new Readable({
      read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              this.push(null)
            } else {
              this.push(value)
            }
          })
          .catch((err) => this.destroy(err))
      },
    })
  }
}
