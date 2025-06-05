import type { WorkStore } from '../app-render/work-async-storage.external'

import {
  postponeWithTracking,
  type DynamicTrackingState,
} from '../app-render/dynamic-rendering'

import {
  workUnitAsyncStorage,
  type PrerenderStore,
} from '../app-render/work-unit-async-storage.external'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import { InvariantError } from '../../shared/lib/invariant-error'

export function createServerPathnameForMetadata(
  underlyingPathname: string,
  workStore: WorkStore
): Promise<string> {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
      case 'prerender-ppr':
      case 'prerender-legacy': {
        return createPrerenderPathname(
          underlyingPathname,
          workStore,
          workUnitStore
        )
      }
      default:
      // fallthrough
    }
  }
  return createRenderPathname(underlyingPathname)
}

function createPrerenderPathname(
  underlyingPathname: string,
  workStore: WorkStore,
  prerenderStore: PrerenderStore
): Promise<string> {
  const fallbackParams = workStore.fallbackRouteParams
  if (fallbackParams && fallbackParams.size > 0) {
    switch (prerenderStore.type) {
      case 'prerender':
        return makeHangingPromise<string>(
          prerenderStore.renderSignal,
          '`pathname`'
        )
      case 'prerender-client':
        throw new InvariantError(
          'createPrerenderPathname was called inside a client component scope.'
        )
      case 'prerender-ppr':
        return makeErroringPathname(workStore, prerenderStore.dynamicTracking)
        break
      default:
        return makeErroringPathname(workStore, null)
    }
  }

  // We don't have any fallback params so we have an entirely static safe params object
  return Promise.resolve(underlyingPathname)
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
