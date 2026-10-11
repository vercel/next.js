import type { ComponentType } from 'react'
import type { ClientReferenceManifest } from '../../../build/webpack/plugins/flight-manifest-plugin'
import type { DeepReadonly } from '../../../shared/lib/deep-readonly'
import type { CompiledTestRequestContext, TestProfile } from '../contracts'
import { createCompiledFileCache } from '../request/compiled-file-cache'
import { createCompiledRequestResources } from '../request/compiled-request'
import { createRequestLifecycle } from '../request/request-lifecycle'
import { runWithRenderRequest } from '../request/request-context'
import { renderServerComponent } from './render'
import {
  renderWithRequestLifecycle,
  RenderRequestCleanupError,
} from './render-request'
import type { ClientReferenceObserver } from './client-references'
import type { RscRenderOptions, RscRenderResult, RscTesting } from './types'
export type { RscRenderOptions, RscRenderResult } from './types'

type RenderAttempt = {
  signal: AbortSignal
  onCleanup(cleanup: () => Promise<void>): void
}

/** Live exports are passed inside the emitted worker, never over worker IPC. */
export interface RscTestingBindings {
  ComponentMod: Parameters<typeof renderServerComponent>[0]
  ConsumerMod: Pick<
    typeof import('./consumer'),
    'decodeFlight' | 'createClientReferenceObserver' | 'observeServerTree'
  >
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>
  requestContext?: CompiledTestRequestContext
  profile: TestProfile
  manifestPage: string
  cacheScope?: { type: 'file'; directory: string }
  previewPropsPath?: string
  prerenderManifestPath?: string
  getActiveAttempt(): RenderAttempt | undefined
}

export class RscRenderError extends Error {
  readonly errors: readonly unknown[]

  constructor(errors: readonly unknown[]) {
    super('Server component rendering failed')
    this.name = 'RscRenderError'
    this.errors = errors.slice()
  }
}

type State = {
  bindings: RscTestingBindings
  fileCache?: ReturnType<typeof createCompiledFileCache>
  references?: ClientReferenceObserver
}

let active: State | undefined
// Keep only the real runner accessor after disposal so closed async scopes still
// report caught late calls to their originating file's late-failure sink.
let validateDisposedScope: RscTestingBindings['getActiveAttempt'] | undefined

/** Called after runtime/manifests/collector initialization, before spec loading. */
export function initializeRscTesting(bindings: RscTestingBindings) {
  if (active)
    throw new Error('RSC testing is already initialized in this realm.')
  const state: State = { bindings }
  active = state
  let disposal: Promise<void> | undefined
  return {
    dispose(): Promise<void> {
      return (disposal ??= Promise.resolve().then(async () => {
        if (active === state) {
          validateDisposedScope = state.bindings.getActiveAttempt
          active = undefined
        }
        state.references?.dispose()
        await state.fileCache?.dispose()
      }))
    },
  }
}

async function render<Props extends {}>(
  Component: ComponentType<Props>,
  props: Props,
  options: RscRenderOptions
): Promise<RscRenderResult> {
  const state = active
  if (!state) {
    validateDisposedScope?.()
    throw new Error('RSC rendering requires an emitted Next test entry.')
  }
  const bindings = state.bindings
  const attempt = bindings.getActiveAttempt()
  if (!attempt)
    throw new Error('RSC rendering requires an active test attempt.')
  const { profile } = bindings
  if (
    (profile.mode !== 'development' && profile.mode !== 'production') ||
    profile.environment !== 'rsc' ||
    profile.runtime !== 'nodejs' ||
    profile.bundler !== 'turbopack' ||
    profile.route !== undefined
  ) {
    throw new Error(
      'RSC rendering currently supports only route-less Turbopack Node RSC subtrees.'
    )
  }
  if (!bindings.requestContext) {
    throw new Error('RSC rendering requires compiled requestContext metadata.')
  }
  if (bindings.requestContext.mode !== profile.mode) {
    throw new Error(
      'RSC rendering requires request metadata matching its compiler profile.'
    )
  }
  if (options?.cacheScope !== 'file') {
    throw new Error(
      'RSC rendering requires explicit cacheScope: "file"; cold request or case caches are not supported.'
    )
  }
  if (
    bindings.cacheScope?.type !== 'file' ||
    !bindings.previewPropsPath ||
    !bindings.prerenderManifestPath
  ) {
    throw new Error(
      'RSC rendering requires a file cache lease and actual preview/prerender manifests.'
    )
  }
  attempt.signal.throwIfAborted()
  const url = new URL(options.url)
  const headers = options.headers ?? {}
  const fileCache = (state.fileCache ??= createCompiledFileCache(
    bindings.requestContext,
    {
      cacheScope: bindings.cacheScope,
      previewPropsPath: bindings.previewPropsPath,
      prerenderManifestPath: bindings.prerenderManifestPath,
    }
  ))
  const references = (state.references ??=
    bindings.ConsumerMod.createClientReferenceObserver(
      bindings.clientReferenceManifest
    ))
  const lifecycle = createRequestLifecycle()
  let cleanup: () => Promise<void> = () => lifecycle.close()
  let cleanupStarted = false
  attempt.onCleanup(async () => {
    cleanupStarted = true
    await cleanup()
  })

  try {
    const resources = await createCompiledRequestResources(
      bindings.requestContext,
      {
        page: bindings.manifestPage,
        url,
        headers,
        rootParams: options.rootParams ?? {},
        incrementalCache: fileCache.createIncrementalCache(headers),
        lifecycle,
      }
    )
    cleanup = resources.close
    attempt.signal.throwIfAborted()
    if (cleanupStarted || active !== state) {
      throw new Error('The RSC test lifetime ended while creating its request.')
    }
    let model!: Promise<unknown>
    const request = runWithRenderRequest(
      resources.inputs,
      resources.workContext,
      () => {
        const handle = renderWithRequestLifecycle(
          { onCleanup: (dispose) => (cleanup = dispose) },
          resources,
          () =>
            renderServerComponent(
              bindings.ComponentMod,
              bindings.clientReferenceManifest,
              Component,
              props,
              { signal: attempt.signal }
            )
        )
        model = bindings.ConsumerMod.decodeFlight(handle.stream)
        return handle
      }
    )
    const [decoded, outcome] = await Promise.all([model, request.completed])
    // A decoded root can resolve even when a nested client prop failed Flight
    // serialization. Always inspect the completed server render as well.
    if (outcome.errors.length === 1) throw outcome.errors[0]
    if (outcome.errors.length > 1) {
      throw new RscRenderError(outcome.errors)
    }
    if (outcome.status === 'aborted') {
      attempt.signal.throwIfAborted()
      throw new Error('Server component render was aborted.')
    }
    const observation = await bindings.ConsumerMod.observeServerTree(
      decoded,
      references,
      attempt.signal
    )
    return { model: decoded, ...observation }
  } catch (error) {
    try {
      await cleanup()
    } catch (cleanupError) {
      if (cleanupError !== error) {
        throw new RenderRequestCleanupError([error, cleanupError])
      }
    }
    throw error
  }
}

export const rsc: RscTesting = { render }
