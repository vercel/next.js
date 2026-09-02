import React from 'react'
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

const getUseSearchParamsBailoutReason = createReactBrowserBailoutReason.bind(
  null,
  'useSearchParams()'
)

// TODO(veil): This module is separated from `dynamic-rendering.ts` as a workaround.
// When these hooks were part of `dynamic-rendering.ts, the source location of these
// `React.use()` calls would show up in Webpack snapshots in `client-hook-abort-reasons.test.ts`,
// which makes changes to the surrounding file needlessly churn the snapshots.
// Until the ignore-listing is fixed, we can make this less annoying by keeping these hooks in a separate file.

export function useDynamicRouteParams(expression: string) {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workStore && workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender-client': {
        const fallbackParams = workUnitStore.fallbackRouteParams

        if (fallbackParams && fallbackParams.size > 0) {
          // We are in a prerender with cacheComponents semantics. We are going to
          // hang here and never resolve. This will cause the currently
          // rendering component to effectively be a dynamic hole.
          React.use(
            makeClientHookHangingPromise(
              workUnitStore.renderSignal,
              new ClientHookDynamicError(workStore.route, expression)
            )
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
      case 'generate-static-params':
        throw new InvariantError(
          `\`${expression}\` was called in \`generateStaticParams\`. Next.js should be preventing ${expression} from being included in server component files statically, but did not in this case.`
        )
      case 'prerender-legacy':
      case 'request':
      case 'unstable-cache':
        break
      default:
        workUnitStore satisfies never
    }
  }
}

export function useDynamicSearchParams(expression: string) {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workStore) {
    // We assume pages router context and just return
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
      React.use(
        makeClientHookHangingPromise(
          workUnitStore.renderSignal,
          new ClientHookDynamicError(workStore.route, expression)
        )
      )
      break
    }
    case 'prerender-legacy': {
      if (workStore.forceStatic) {
        return
      }
      if (process.env.__NEXT_EXPERIMENTAL_REACT_BROWSER_BAILOUT) {
        // @ts-expect-error TODO: Update @types/react-dom to include the reason argument.
        React.use(browser(getUseSearchParamsBailoutReason))
        return
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
    case 'generate-static-params':
      throw new InvariantError(
        `\`${expression}\` was called in \`generateStaticParams\`. Next.js should be preventing ${expression} from being included in server component files statically, but did not in this case.`
      )
    case 'request':
      return
    default:
      workUnitStore satisfies never
  }
}
