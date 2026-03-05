import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'

import {
  throwInvariantForMissingStore,
  workUnitAsyncStorage,
  type PrerenderStoreLegacy,
  type PrerenderStoreModernServer,
} from '../app-render/work-unit-async-storage.external'
import {
  delayUntilRuntimeStage,
  makeHangingPromise,
} from '../dynamic-rendering-utils'
import { InvariantError } from '../../shared/lib/invariant-error'

export function createServerPathnameForMetadata(
  underlyingPathname: string
): Promise<string> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError('Expected workStore to be initialized')
  }
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
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
  prerenderStore: PrerenderStoreLegacy | PrerenderStoreModernServer
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
