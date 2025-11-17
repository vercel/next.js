import { workAsyncStorage } from '../app-render/work-async-storage.external'
import {
  throwForMissingRequestStore,
  workUnitAsyncStorage,
} from '../app-render/work-unit-async-storage.external'
import {
  postponeWithTracking,
  throwToInterruptStaticGeneration,
  trackDynamicDataInDynamicRender,
} from '../app-render/dynamic-rendering'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import {
  makeHangingPromise,
  makeDevtoolsIOAwarePromise,
} from '../dynamic-rendering-utils'
import { isRequestAPICallableInsideAfter } from './utils'
import { RenderStage } from '../app-render/staged-rendering'

/**
 * This function allows you to indicate that you require an actual user Request before continuing.
 *
 * During prerendering it will never resolve and during rendering it resolves immediately.
 */
export function connection(): Promise<void> {
  const callingExpression = 'connection'
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workStore) {
    if (
      workUnitStore &&
      workUnitStore.phase === 'after' &&
      !isRequestAPICallableInsideAfter()
    ) {
      throw new Error(
        `Route ${workStore.route} used \`connection()\` inside \`after()\`. The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual Request, but \`after()\` executes after the request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/canary/app/api-reference/functions/after`
      )
    }

    if (workStore.forceStatic) {
      // When using forceStatic, we override all other logic and always just
      // return a resolving promise without tracking.
      return Promise.resolve(undefined)
    }

    if (workStore.dynamicShouldError) {
      throw new StaticGenBailoutError(
        `Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`connection()\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (workUnitStore) {
      switch (workUnitStore.type) {
        case 'cache': {
          const error = new Error(
            `Route ${workStore.route} used \`connection()\` inside "use cache". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual request, but caches must be able to be produced before a request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
          )
          Error.captureStackTrace(error, connection)
          workStore.invalidDynamicUsageError ??= error
          throw error
        }
        case 'private-cache': {
          // It might not be intuitive to throw for private caches as well, but
          // we don't consider runtime prefetches as "actual requests" (in the
          // navigation sense), despite allowing them to read cookies.
          const error = new Error(
            `Route ${workStore.route} used \`connection()\` inside "use cache: private". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual navigation request, but caches must be able to be produced before a navigation request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
          )
          Error.captureStackTrace(error, connection)
          workStore.invalidDynamicUsageError ??= error
          throw error
        }
        case 'unstable-cache':
          throw new Error(
            `Route ${workStore.route} used \`connection()\` inside a function cached with \`unstable_cache()\`. The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual Request, but caches must be able to be produced before a Request so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
          )
        case 'prerender':
        case 'prerender-client':
        case 'prerender-runtime':
          // We return a promise that never resolves to allow the prerender to
          // stall at this point.
          return makeHangingPromise(
            workUnitStore.renderSignal,
            workStore.route,
            '`connection()`'
          )
        case 'prerender-ppr':
          // We use React's postpone API to interrupt rendering here to create a
          // dynamic hole
          return postponeWithTracking(
            workStore.route,
            'connection',
            workUnitStore.dynamicTracking
          )
        case 'prerender-legacy':
          // We throw an error here to interrupt prerendering to mark the route
          // as dynamic
          return throwToInterruptStaticGeneration(
            'connection',
            workStore,
            workUnitStore
          )
        case 'request':
          trackDynamicDataInDynamicRender(workUnitStore)
          if (process.env.NODE_ENV === 'development') {
            // Semantically we only need the dev tracking when running in `next dev`
            // but since you would never use next dev with production NODE_ENV we use this
            // as a proxy so we can statically exclude this code from production builds.
            if (workUnitStore.asyncApiPromises) {
              return workUnitStore.asyncApiPromises.connection
            }
            return makeDevtoolsIOAwarePromise(
              undefined,
              workUnitStore,
              RenderStage.Dynamic
            )
          } else {
            return Promise.resolve(undefined)
          }
        default:
          workUnitStore satisfies never
      }
    }
  }

  // If we end up here, there was no work store or work unit store present.
  throwForMissingRequestStore(callingExpression)
}
