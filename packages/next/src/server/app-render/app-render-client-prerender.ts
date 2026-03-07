import type { Readable } from 'node:stream'
import type { ComponentType, JSX } from 'react'

import type { WorkStore } from './work-async-storage.external'
import type {
  PrerenderStore,
  PrerenderStoreModernClient,
  ValidationStoreClient,
} from './work-unit-async-storage.external'
import type { ImplicitTags } from '../lib/implicit-tags'
import type { OpaqueFallbackRouteParams } from '../request/fallback-params'
import type { Params } from '../request/params'
import type { CacheSignal } from './cache-signal'

import { INFINITE_CACHE } from '../../lib/constants'
import { runInSequentialTasks } from './app-render-render-utils'
import { getDigestForWellKnownError } from './create-error-handler'
import { isPrerenderInterruptedError } from './dynamic-rendering'
import { trackPendingModules } from './module-loading/track-module-loading.external'
import {
  Phase,
  printDebugThrownValueForProspectiveRender,
} from './prospective-render-utils'
import { isReactLargeShellError } from './react-large-shell-error'
import { createServerInsertedHTML } from './server-inserted-html'
import { getClientPrerender } from './stream-ops'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'

type ClientPrerenderOptions = Omit<
  NonNullable<Parameters<typeof getClientPrerender>[1]>,
  'signal'
> & {
  maxHeadersLength?: number
}

export type CreateClientPrerenderApp = (options: {
  reactServerStream: Readable | ReadableStream<Uint8Array>
  reactDebugStream?: Readable | ReadableStream<Uint8Array>
  debugEndTime?: number
  ServerInsertedHTMLProvider: ComponentType<{
    children: JSX.Element
  }>
}) => JSX.Element

type ClientPrerenderControllers = {
  reactController: AbortController
  renderController: AbortController
}

type ClientPrerenderPassContext = ClientPrerenderControllers & {
  ServerInsertedHTMLProvider: ComponentType<{
    children: JSX.Element
  }>
}

type SharedClientStoreOptions = {
  rootParams: Params
  implicitTags: ImplicitTags
  renderController: AbortController
  hmrRefreshHash: string | undefined
}

type PrerenderClientStoreOptions = SharedClientStoreOptions & {
  storeType: 'prerender-client'
  controller: AbortController
  fallbackRouteParams: OpaqueFallbackRouteParams | null
  allowEmptyStaticShell: boolean
  dynamicTracking: PrerenderStoreModernClient['dynamicTracking']
  prerenderResumeDataCache: PrerenderStoreModernClient['prerenderResumeDataCache']
  renderResumeDataCache: PrerenderStoreModernClient['renderResumeDataCache']
}

type ValidationClientStoreOptions = SharedClientStoreOptions & {
  storeType: 'validation-client'
  controller: AbortController
  dynamicTracking: ValidationStoreClient['dynamicTracking']
  boundaryState: ValidationStoreClient['boundaryState']
}

export function createClientPrerenderStore(
  options: PrerenderClientStoreOptions
): PrerenderStoreModernClient
export function createClientPrerenderStore(
  options: ValidationClientStoreOptions
): ValidationStoreClient
export function createClientPrerenderStore(
  options: PrerenderClientStoreOptions | ValidationClientStoreOptions
): PrerenderStoreModernClient | ValidationStoreClient {
  const common = {
    phase: 'render' as const,
    rootParams: options.rootParams,
    implicitTags: options.implicitTags,
    renderSignal: options.renderController.signal,
    controller: options.controller,
    // For HTML Generation the only cache tracked activity is module loading,
    // which has its own cache signal.
    cacheSignal: null,
    dynamicTracking: options.dynamicTracking,
    revalidate: INFINITE_CACHE,
    expire: INFINITE_CACHE,
    stale: INFINITE_CACHE,
    tags: [...options.implicitTags.tags],
    hmrRefreshHash: options.hmrRefreshHash,
    // Client prerenders don't track server param access.
    varyParamsAccumulator: null,
  }

  if (options.storeType === 'prerender-client') {
    return {
      type: 'prerender-client',
      ...common,
      fallbackRouteParams: options.fallbackRouteParams,
      allowEmptyStaticShell: options.allowEmptyStaticShell,
      prerenderResumeDataCache: options.prerenderResumeDataCache,
      renderResumeDataCache: options.renderResumeDataCache,
    }
  }

  return {
    type: 'validation-client',
    ...common,
    prerenderResumeDataCache: null,
    renderResumeDataCache: null,
    boundaryState: options.boundaryState,
  }
}

function attachReactAbortToRenderAbort(
  reactController: AbortController,
  renderController: AbortController
) {
  // This must be registered after React adds its own abort listener so pending
  // I/O is not rejected before React observes the abort.
  reactController.signal.addEventListener(
    'abort',
    () => {
      renderController.abort()
    },
    { once: true }
  )
}

export function startClientPrerender({
  prerenderStore,
  reactController,
  renderController,
  app,
  options,
}: {
  prerenderStore: PrerenderStore
  reactController: AbortController
  renderController: AbortController
  app: JSX.Element
  options: ClientPrerenderOptions
}): ReturnType<typeof getClientPrerender> {
  const pendingResult = workUnitAsyncStorage.run(
    prerenderStore,
    getClientPrerender,
    app,
    {
      signal: reactController.signal,
      ...options,
    }
  )

  attachReactAbortToRenderAbort(reactController, renderController)

  return pendingResult
}

function handleProspectiveClientPrerenderError(
  err: unknown,
  reactController: AbortController,
  workStore: WorkStore
) {
  const digest = getDigestForWellKnownError(err)

  if (digest) {
    return digest
  }

  if (isReactLargeShellError(err)) {
    // TODO: Aggregate
    console.error(err)
    return undefined
  }

  if (reactController.signal.aborted) {
    // These are expected errors that might error the prerender. we ignore them.
    return
  }

  logUnexpectedProspectivePrerenderError(err, workStore)
}

export function runClientPrerenderInSequentialTasks(
  options: Parameters<typeof startClientPrerender>[0]
): ReturnType<typeof getClientPrerender> {
  return runInSequentialTasks(
    () => startClientPrerender(options),
    () => {
      options.reactController.abort()
    }
  )
}

export function runClientPrerenderPass({
  setup,
}: {
  setup: (context: ClientPrerenderPassContext) =>
    | {
        prerenderStore: PrerenderStore
        app: JSX.Element
        options: ClientPrerenderOptions
      }
    | Promise<{
        prerenderStore: PrerenderStore
        app: JSX.Element
        options: ClientPrerenderOptions
      }>
}): Promise<Awaited<ReturnType<typeof getClientPrerender>>> {
  type ClientPrerenderPassResult = {
    prerenderStore: PrerenderStore
    app: JSX.Element
    options: ClientPrerenderOptions
  }

  function isPromiseLike(
    value: ClientPrerenderPassResult | PromiseLike<ClientPrerenderPassResult>
  ): value is PromiseLike<ClientPrerenderPassResult> {
    return (
      typeof (value as PromiseLike<ClientPrerenderPassResult>).then ===
      'function'
    )
  }

  function runPreparedClientPrerender({
    prerenderStore,
    app,
    options,
  }: ClientPrerenderPassResult) {
    return runClientPrerenderInSequentialTasks({
      prerenderStore,
      reactController,
      renderController,
      app,
      options,
    })
  }

  const reactController = new AbortController()
  const renderController = new AbortController()
  const { ServerInsertedHTMLProvider } = createServerInsertedHTML()
  const prepared = setup({
    reactController,
    renderController,
    ServerInsertedHTMLProvider,
  })

  if (isPromiseLike(prepared)) {
    return Promise.resolve(prepared).then(runPreparedClientPrerender)
  }

  return runPreparedClientPrerender(prepared)
}

export async function warmupProspectiveClientPrerender({
  prerenderStore,
  reactController,
  renderController,
  app,
  options,
  cacheSignal,
  workStore,
}: {
  prerenderStore: PrerenderStore
  reactController: AbortController
  renderController: AbortController
  app: JSX.Element
  options?: Omit<ClientPrerenderOptions, 'onError'>
  cacheSignal: CacheSignal
  workStore: WorkStore
}) {
  const pendingResult = startClientPrerender({
    prerenderStore,
    reactController,
    renderController,
    app,
    options: {
      ...options,
      onError: (err: unknown) =>
        handleProspectiveClientPrerenderError(err, reactController, workStore),
    },
  })

  attachProspectivePrerenderRejectionHandler(
    pendingResult,
    reactController,
    workStore
  )

  trackPendingModules(cacheSignal)
  await cacheSignal.cacheReady()
  reactController.abort()
}

export function logUnexpectedProspectivePrerenderError(
  err: unknown,
  workStore: WorkStore
) {
  if (process.env.NEXT_DEBUG_BUILD || process.env.__NEXT_VERBOSE_LOGGING) {
    // We don't normally log these errors because we are going to retry anyway,
    // but it can be useful for debugging Next.js itself to get visibility here
    // when needed.
    printDebugThrownValueForProspectiveRender(
      err,
      workStore.route,
      Phase.ProspectiveRender
    )
  }
}

export function attachProspectivePrerenderRejectionHandler(
  pendingResult: Promise<unknown>,
  reactController: AbortController,
  workStore: WorkStore
) {
  pendingResult.catch((err: unknown) => {
    if (reactController.signal.aborted || isPrerenderInterruptedError(err)) {
      // These are expected errors that might error the prerender. we ignore them.
      return
    }

    logUnexpectedProspectivePrerenderError(err, workStore)
  })
}
