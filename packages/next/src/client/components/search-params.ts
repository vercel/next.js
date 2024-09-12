import type { ParsedUrlQuery } from 'querystring'

import { staticGenerationAsyncStorage } from './static-generation-async-storage.external'
import { trackDynamicDataAccessed } from '../../server/app-render/dynamic-rendering'
import { ReflectAdapter } from '../../server/web/spec-extension/adapters/reflect'

/**
 * Takes a ParsedUrlQuery object and either returns it unmodified or returns an empty object
 *
 * Even though we do not track read access on the returned searchParams we need to
 * return an empty object if we are doing a 'force-static' render. This is to ensure
 * we don't encode the searchParams into the flight data.
 */
export function createUntrackedSearchParams(
  searchParams: ParsedUrlQuery
): ParsedUrlQuery {
  const store = staticGenerationAsyncStorage.getStore()
  if (store && store.forceStatic) {
    return {}
  } else {
    return searchParams
  }
}

/**
 * Takes a ParsedUrlQuery object and returns a Proxy that tracks read access to the object
 *
 * If running in the browser will always return the provided searchParams object.
 * When running during SSR will return empty during a 'force-static' render and
 * otherwise it returns a searchParams object which tracks reads to trigger dynamic rendering
 * behavior if appropriate
 */
export function createDynamicallyTrackedSearchParams(
  searchParams: ParsedUrlQuery
): ParsedUrlQuery {
  const store = staticGenerationAsyncStorage.getStore()
  if (!store) {
    // we assume we are in a route handler or page render. just return the searchParams
    return searchParams
  } else if (store.forceStatic) {
    // If we forced static we omit searchParams entirely. This is true both during SSR
    // and browser render because we need there to be parity between these environments
    return {}
  } else {
    // We need to track dynamic access with a Proxy. If `dynamic = "error"`, we use this information
    // to fail the build. This also signals to the patched fetch that it's inside
    // of a dynamic render and should bail from data cache. We implement get, has, and ownKeys because
    // these can all be used to exfiltrate information about searchParams.

    const trackedSearchParams: ParsedUrlQuery = store.isStaticGeneration
      ? {}
      : searchParams

    return new Proxy(trackedSearchParams, {
      get(target, prop, receiver) {
        if (typeof prop === 'string') {
          trackDynamicDataAccessed(store, `searchParams.${prop}`)
        }
        return ReflectAdapter.get(target, prop, receiver)
      },
      has(target, prop) {
        if (typeof prop === 'string') {
          trackDynamicDataAccessed(store, `searchParams.${prop}`)
        }
        return Reflect.has(target, prop)
      },
      ownKeys(target) {
        trackDynamicDataAccessed(store, 'searchParams')
        return Reflect.ownKeys(target)
      },
    })
  }
}
