import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'

import {
  postponeWithTracking,
  type DynamicTrackingState,
} from '../app-render/dynamic-rendering'

import {
  throwInvariantForMissingStore,
  workUnitAsyncStorage,
  type PrerenderStoreLegacy,
  type PrerenderStoreModernRuntime,
  type PrerenderStoreModernServer,
  type PrerenderStorePPR,
} from '../app-render/work-unit-async-storage.external'
import {
  makeHangingPromise,
  RENDER_STAGES_BY_DATA_KIND,
} from '../dynamic-rendering-utils'
import { InvariantError } from '../../shared/lib/invariant-error'
import type { Params } from './params'
import { allParamsAreRootParams, isEmptyParams } from '../lib/params-utils'

export function createServerPathnameForMetadata(
  underlyingPathname: string,
  params: Params
): Promise<string> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError('Expected workStore to be initialized')
  }
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-ppr':
      case 'prerender-legacy': {
        return createPrerenderPathname(
          underlyingPathname,
          workStore,
          workUnitStore
        )
      }
      case 'prerender-client':
      case 'validation-client':
        throw new InvariantError(
          'createServerPathnameForMetadata should not be called in client contexts.'
        )
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        throw new InvariantError(
          'createServerPathnameForMetadata should not be called in cache contexts.'
        )
      case 'generate-static-params':
        throw new InvariantError(
          'createServerPathnameForMetadata should not be called inside generateStaticParams.'
        )
      case 'prerender-runtime': {
        return createRuntimePrerenderPathname(
          underlyingPathname,
          params,
          workStore,
          workUnitStore
        )
      }
      case 'request':
        // TODO(app-shells): this should be delayed if there's non-static params
        return createRenderPathname(underlyingPathname)
      default:
        workUnitStore satisfies never
    }
  }
  throwInvariantForMissingStore()
}

function createPrerenderPathname(
  underlyingPathname: string,
  workStore: WorkStore,
  prerenderStore:
    | PrerenderStoreLegacy
    | PrerenderStorePPR
    | PrerenderStoreModernServer
): Promise<string> {
  switch (prerenderStore.type) {
    case 'prerender': {
      const fallbackParams = prerenderStore.fallbackRouteParams
      if (fallbackParams && fallbackParams.size > 0) {
        return makeHangingPromise<string>(
          prerenderStore.renderSignal,
          workStore.route,
          '`pathname`'
        )
      }
      break
    }
    case 'prerender-ppr': {
      const fallbackParams = prerenderStore.fallbackRouteParams
      if (fallbackParams && fallbackParams.size > 0) {
        return makeErroringPathname(workStore, prerenderStore.dynamicTracking)
      }
      break
    }
    case 'prerender-legacy':
      break
    default:
      prerenderStore satisfies never
  }

  // We don't have any fallback params so we have an entirely static safe params object
  return Promise.resolve(underlyingPathname)
}

function createRuntimePrerenderPathname(
  underlyingPathname: string,
  params: Params,
  workStore: WorkStore,
  workUnitStore: PrerenderStoreModernRuntime
): Promise<string> {
  const { stagedRendering, rootParams } = workUnitStore

  // If there's no params or they're all root params, then this is not link data
  // (i.e. is allowed in the shell stage) and we don't need to delay it.
  if (isEmptyParams(params) || allParamsAreRootParams(params, rootParams)) {
    return createRenderPathname(underlyingPathname)
  }

  if (stagedRendering) {
    // Final prerender.
    const pathnameStage = RENDER_STAGES_BY_DATA_KIND.runtimeLinkData
    return stagedRendering.delayUntilStage(
      pathnameStage,
      undefined,
      underlyingPathname
    )
  }

  // Prospective prerender.
  if (workUnitStore.isSessionShell) {
    // These will be hanging in the final prerender.
    return makeHangingPromise<string>(
      workUnitStore.renderSignal,
      workStore.route,
      '`pathname`'
    )
  } else {
    // These will resolve in the Runtime stage of the final prerender.
    return createRenderPathname(underlyingPathname)
  }
}

function makeErroringPathname<T>(
  workStore: WorkStore,
  dynamicTracking: null | DynamicTrackingState
): Promise<T> {
  let reject: null | ((reason: unknown) => void) = null
  const promise = new Promise<T>((_, re) => {
    reject = re
  })

  const originalThen = promise.then.bind(promise)

  // We instrument .then so that we can generate a tracking event only if you actually
  // await this promise, not just that it is created.
  promise.then = (onfulfilled, onrejected) => {
    if (reject) {
      try {
        postponeWithTracking(
          workStore.route,
          'metadata relative url resolving',
          dynamicTracking
        )
      } catch (error) {
        reject(error)
        reject = null
      }
    }
    return originalThen(onfulfilled, onrejected)
  }

  // We wrap in a noop proxy to trick the runtime into thinking it
  // isn't a native promise (it's not really). This is so that awaiting
  // the promise will call the `then` property triggering the lazy postpone
  return new Proxy(promise, {})
}

function createRenderPathname(underlyingPathname: string): Promise<string> {
  return Promise.resolve(underlyingPathname)
}
