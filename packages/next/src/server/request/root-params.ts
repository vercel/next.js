import { InvariantError } from '../../shared/lib/invariant-error'
import {
  postponeWithTracking,
  throwToInterruptStaticGeneration,
} from '../app-render/dynamic-rendering'
import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'
import {
  workUnitAsyncStorage,
  type PrerenderStoreLegacy,
  type PrerenderStorePPR,
  type StaticPrerenderStore,
} from '../app-render/work-unit-async-storage.external'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import type { ParamValue } from './params'
import { describeStringPropertyAccess } from '../../shared/lib/utils/reflect-utils'
import { actionAsyncStorage } from '../app-render/action-async-storage.external'

/**
 * Used for the compiler-generated `next/root-params` module.
 * @internal
 */
export function getRootParam(paramName: string): Promise<ParamValue> {
  const apiName = `\`import('next/root-params').${paramName}()\``

  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError(`Missing workStore in ${apiName}`)
  }

  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!workUnitStore) {
    throw new Error(
      `Route ${workStore.route} used ${apiName} outside of a Server Component. This is not allowed.`
    )
  }

  const actionStore = actionAsyncStorage.getStore()
  if (actionStore) {
    if (actionStore.isAppRoute) {
      // TODO(root-params): add support for route handlers
      throw new Error(
        `Route ${workStore.route} used ${apiName} inside a Route Handler. Support for this API in Route Handlers is planned for a future version of Next.js.`
      )
    }
    if (actionStore.isAction && workUnitStore.phase === 'action') {
      // Actions are not fundamentally tied to a route (even if they're always submitted from some page),
      // so root params would be inconsistent if an action is called from multiple roots.
      // Make sure we check if the phase is "action" - we should not error in the rerender
      // after an action revalidates or updates cookies (which will still have `actionStore.isAction === true`)
      throw new Error(
        `${apiName} was used inside a Server Action. This is not supported. Functions from 'next/root-params' can only be called in the context of a route.`
      )
    }
  }

  switch (workUnitStore.type) {
    case 'unstable-cache':
    case 'cache': {
      throw new Error(
        `Route ${workStore.route} used ${apiName} inside \`"use cache"\` or \`unstable_cache\`. Support for this API inside cache scopes is planned for a future version of Next.js.`
      )
    }
    case 'prerender':
    case 'prerender-client':
    case 'prerender-ppr':
    case 'prerender-legacy': {
      return createPrerenderRootParamPromise(
        paramName,
        workStore,
        workUnitStore,
        apiName
      )
    }
    case 'private-cache':
    case 'prerender-runtime':
    case 'request': {
      break
    }
    default: {
      workUnitStore satisfies never
    }
  }
  return Promise.resolve(workUnitStore.rootParams[paramName])
}

function createPrerenderRootParamPromise(
  paramName: string,
  workStore: WorkStore,
  prerenderStore: StaticPrerenderStore,
  apiName: string
): Promise<ParamValue> {
  switch (prerenderStore.type) {
    case 'prerender-client': {
      throw new InvariantError(
        `${apiName} must not be used within a client component. Next.js should be preventing ${apiName} from being included in client components statically, but did not in this case.`
      )
    }
    case 'prerender':
    case 'prerender-legacy':
    case 'prerender-ppr':
    default:
  }

  const underlyingParams = prerenderStore.rootParams

  switch (prerenderStore.type) {
    case 'prerender': {
      // We are in a cacheComponents prerender.
      // The param is a fallback, so it should be treated as dynamic.
      if (
        prerenderStore.fallbackRouteParams &&
        prerenderStore.fallbackRouteParams.has(paramName)
      ) {
        return makeHangingPromise<ParamValue>(
          prerenderStore.renderSignal,
          workStore.route,
          apiName
        )
      }
      break
    }
    case 'prerender-ppr': {
      // We aren't in a cacheComponents prerender, but the param is a fallback,
      // so we need to make an erroring params object which will postpone/error if you access it
      if (
        prerenderStore.fallbackRouteParams &&
        prerenderStore.fallbackRouteParams.has(paramName)
      ) {
        return makeErroringRootParamPromise(
          paramName,
          workStore,
          prerenderStore,
          apiName
        )
      }
      break
    }
    case 'prerender-legacy': {
      // legacy prerenders can't have fallback params
      break
    }
    default: {
      prerenderStore satisfies never
    }
  }

  // If the param is not a fallback param, we just return the statically available value.
  return Promise.resolve(underlyingParams[paramName])
}

/** Deliberately async -- we want to create a rejected promise, not error synchronously. */
async function makeErroringRootParamPromise(
  paramName: string,
  workStore: WorkStore,
  prerenderStore: PrerenderStorePPR | PrerenderStoreLegacy,
  apiName: string
): Promise<ParamValue> {
  const expression = describeStringPropertyAccess(apiName, paramName)
  // In most dynamic APIs, we also throw if `dynamic = "error"`.
  // However, root params are only dynamic when we're generating a fallback shell,
  // and even with `dynamic = "error"` we still support generating dynamic fallback shells.
  // TODO: remove this comment when cacheComponents is the default since there will be no `dynamic = "error"`
  switch (prerenderStore.type) {
    case 'prerender-ppr': {
      return postponeWithTracking(
        workStore.route,
        expression,
        prerenderStore.dynamicTracking
      )
    }
    case 'prerender-legacy': {
      return throwToInterruptStaticGeneration(
        expression,
        workStore,
        prerenderStore
      )
    }
    default: {
      prerenderStore satisfies never
    }
  }
}
