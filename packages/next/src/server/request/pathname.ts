import type { WorkStore } from '../app-render/work-async-storage.external'

import { delayUntilRuntimeStage } from '../app-render/dynamic-rendering'

import {
  throwInvariantForMissingStore,
  workUnitAsyncStorage,
  type StaticPrerenderStore,
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
      case 'prerender-legacy': {
        return createPrerenderPathname(
          underlyingPathname,
          workStore,
          workUnitStore
        )
      }
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        throw new InvariantError(
          'createServerPathnameForMetadata should not be called in cache contexts.'
        )

      case 'prerender-runtime':
        return delayUntilRuntimeStage(
          workUnitStore,
          createRenderPathname(underlyingPathname)
        )
      case 'request':
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
  prerenderStore: StaticPrerenderStore
): Promise<string> {
  switch (prerenderStore.type) {
    case 'prerender-client':
      throw new InvariantError(
        'createPrerenderPathname was called inside a client component scope.'
      )
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
    case 'prerender-legacy':
      break
    default:
      prerenderStore satisfies never
  }

  // We don't have any fallback params so we have an entirely static safe params object
  return Promise.resolve(underlyingPathname)
}

function createRenderPathname(underlyingPathname: string): Promise<string> {
  return Promise.resolve(underlyingPathname)
}
