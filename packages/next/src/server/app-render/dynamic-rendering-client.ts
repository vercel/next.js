import { browser } from 'react-dom'
import {
  throwForMissingRequestStore,
  workUnitAsyncStorage,
} from './work-unit-async-storage.external'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import {
  ClientHookDynamicError,
  makeClientHookHangingPromise,
} from '../dynamic-rendering-utils'
import { InvariantError } from '../../shared/lib/invariant-error'
import { BailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { createReactBrowserBailoutReason } from '../../shared/lib/lazy-dynamic/react-browser-bailout'
import type { OpaqueFallbackRouteParams } from '../request/fallback-params'
import type { BrowserUsable } from 'react-dom/canary'

// TODO(veil): This module is separated from `dynamic-rendering.ts` as a workaround.
// When these functions were part of `dynamic-rendering.ts, the source location of these
// calls would show up in Webpack snapshots in `client-hook-abort-reasons.test.ts`,
// which makes changes to the surrounding file needlessly churn the snapshots.
// Until the ignore-listing is fixed, we can make this less annoying by keeping them in a separate file.

/**
 * Called by a client navigation hook whose output depends on the values of
 * the route params. During a prerender whose params aren't all known (a
 * fallback shell), makes the calling component dynamic.
 *
 * Not a hook — it reads no hook state, only the ambient stores, so callers
 * may invoke it conditionally (e.g. `unstable_useRelativeHref` only calls it
 * when its result actually depends on an unknown param value). Instead of
 * suspending itself, it returns a hanging promise when the render should
 * block; the calling hook must pass it to `use()`, which is where the
 * suspension belongs (and where a conditional `use` call is legal).
 */
export function trackDynamicRouteParamsAccess(
  expression: string
): Promise<never> | undefined {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!workStore) {
    // Assume that we're in pages router
    return
  }
  if (!workUnitStore) {
    throwForMissingRequestStore(expression)
  }

  switch (workUnitStore.type) {
    case 'prerender-client': {
      const fallbackParams = workUnitStore.fallbackRouteParams

      if (fallbackParams && fallbackParams.size > 0) {
        // We are in a prerender with cacheComponents semantics. The
        // returned promise hangs and never resolves, so when the calling
        // hook passes it to `use()`, the currently rendering component
        // effectively becomes a dynamic hole.
        return makeClientHookHangingPromise(
          workUnitStore.renderSignal,
          new ClientHookDynamicError(workStore.route, expression)
        )
      }
      break
    }
    case 'prerender':
      throw new InvariantError(
        `\`${expression}\` was called from a Server Component. Next.js should be preventing ${expression} from being included in server components statically, but did not in this case.`
      )
    case 'validation-client': {
      // Don't check fallbackRouteParams here. We handle params that weren't
      // provided in the samples using a proxy that throws when accessed.
      break
    }
    case 'prerender-runtime':
      throw new InvariantError(
        `\`${expression}\` was called during a runtime prerender. Next.js should be preventing ${expression} from being included in server components statically, but did not in this case.`
      )
    case 'cache':
    case 'private-cache':
      throw new InvariantError(
        `\`${expression}\` was called inside a cache scope. Next.js should be preventing ${expression} from being included in server components statically, but did not in this case.`
      )
    case 'build-time-generator':
      throw new InvariantError(
        `\`${expression}\` was called in \`${workUnitStore.functionName}\`. Next.js should be preventing ${expression} from being included in server component files statically, but did not in this case.`
      )
    case 'prerender-legacy':
    case 'request':
    case 'unstable-cache':
      break
    default:
      workUnitStore satisfies never
  }
}

/**
 * Reads the fallback route params of the current render, if it's a prerender
 * that has any: the route params whose values are not known because the
 * output being generated is shared across all values (e.g. the fallback
 * shell of a route with dynamic params). Returns null during regular request
 * rendering, where every param value is known.
 *
 * Used by client hooks whose output only sometimes depends on the values of
 * route params (e.g. `unstable_useRelativeHref`) to detect which values are
 * unknown, rather than unconditionally deopting.
 */
export function getPrerenderFallbackParams(): OpaqueFallbackRouteParams | null {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
      case 'validation-client':
        return workUnitStore.fallbackRouteParams
      case 'request':
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
      case 'prerender-legacy':
      case 'prerender-runtime':
      case 'build-time-generator':
        return null
      default:
        workUnitStore satisfies never
        return null
    }
  }
  return null
}

const getUseSearchParamsBailoutReason = createReactBrowserBailoutReason.bind(
  null,
  'useSearchParams()'
)

/**
 * Called by `useSearchParams` in a client page. Search params are always
 * request time values, so this makes the calling component dynamic in any
 * prerender. Like `trackDynamicRouteParamsAccess`, not a hook: it returns a
 * hanging usable when the render should block, and the calling hook passes
 * it to `use()`.
 */
export function trackDynamicSearchParamsAccess(
  expression: string
): Promise<never> | BrowserUsable | undefined {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workStore) {
    // Assume that we're in pages router
    return
  }

  if (!workUnitStore) {
    throwForMissingRequestStore(expression)
  }

  switch (workUnitStore.type) {
    case 'validation-client':
      // During instant validation we try to behave as close to client as possible,
      // so this shouldn't hang during SSR.
      return
    case 'prerender-client': {
      // The returned promise hangs and never resolves; the calling hook
      // passes it to `use()`, making the component a dynamic hole.
      return makeClientHookHangingPromise(
        workUnitStore.renderSignal,
        new ClientHookDynamicError(workStore.route, expression)
      )
    }
    case 'prerender-legacy': {
      // NOTE: prerender-legacy is used for both server and client prerenders.
      // Assume that the compiler prevented using it on the server.
      if (workStore.forceStatic) {
        return
      }
      if (process.env.__NEXT_EXPERIMENTAL_REACT_BROWSER_BAILOUT) {
        // @ts-expect-error TODO: Update @types/react-dom to include the reason argument.
        return browser(getUseSearchParamsBailoutReason)
      } else {
        throw new BailoutToCSRError(expression)
      }
    }
    case 'prerender':
    case 'prerender-runtime':
      throw new InvariantError(
        `\`${expression}\` was called from a Server Component. Next.js should be preventing ${expression} from being included in server components statically, but did not in this case.`
      )
    case 'cache':
    case 'unstable-cache':
    case 'private-cache':
      throw new InvariantError(
        `\`${expression}\` was called inside a cache scope. Next.js should be preventing ${expression} from being included in server components statically, but did not in this case.`
      )
    case 'build-time-generator':
      throw new InvariantError(
        `\`${expression}\` was called in \`${workUnitStore.functionName}\`. Next.js should be preventing ${expression} from being included in server component files statically, but did not in this case.`
      )
    case 'request':
      return
    default:
      workUnitStore satisfies never
  }
}
