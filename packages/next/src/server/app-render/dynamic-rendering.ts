/**
 * The functions provided by this module are used to communicate certain properties
 * about the currently running code so that Next.js can make decisions on how to handle
 * the current execution in different rendering modes such as pre-rendering, resuming, and SSR.
 *
 * Today Next.js treats all code as potentially static. Certain APIs may only make sense when dynamically rendering.
 * Traditionally this meant deopting the entire render to dynamic however with PPR we can now deopt parts
 * of a React tree as dynamic while still keeping other parts static. There are really two different kinds of
 * Dynamic indications.
 *
 * The first is simply an intention to be dynamic. unstable_noStore is an example of this where
 * the currently executing code simply declares that the current scope is dynamic but if you use it
 * inside unstable_cache it can still be cached. This type of indication can be removed if we ever
 * make the default dynamic to begin with because the only way you would ever be static is inside
 * a cache scope which this indication does not affect.
 *
 * The second is an indication that a dynamic data source was read. This is a stronger form of dynamic
 * because it means that it is inappropriate to cache this at all. using a dynamic data source inside
 * unstable_cache should error. If you want to use some dynamic data inside unstable_cache you should
 * read that data outside the cache and pass it in as an argument to the cached function.
 */

import type { WorkStore } from '../app-render/work-async-storage.external'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'

// Once postpone is in stable we should switch to importing the postpone export directly
import React from 'react'

import { DynamicServerError } from '../../client/components/hooks-server-context'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import {
  workUnitAsyncStorage,
  type PrerenderStoreLegacy,
  type PrerenderStoreModern,
} from './work-unit-async-storage.external'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import {
  METADATA_BOUNDARY_NAME,
  VIEWPORT_BOUNDARY_NAME,
  OUTLET_BOUNDARY_NAME,
} from '../../lib/metadata/metadata-constants'

const hasPostpone = typeof React.unstable_postpone === 'function'

type DynamicAccess = {
  /**
   * If debugging, this will contain the stack trace of where the dynamic access
   * occurred. This is used to provide more information to the user about why
   * their page is being rendered dynamically.
   */
  stack?: string

  /**
   * The expression that was accessed dynamically.
   */
  expression: string
}

// Stores dynamic reasons used during a render.
export type DynamicTrackingState = {
  /**
   * When true, stack information will also be tracked during dynamic access.
   */
  readonly isDebugDynamicAccesses: boolean | undefined

  /**
   * The dynamic accesses that occurred during the render.
   */
  readonly dynamicAccesses: Array<DynamicAccess>

  /**
   * disallowedDynamic tracks information about what dynamic accesses
   * were not properly scoped. These are prerender failures both at build
   * and revalidate time.
   */
  readonly disallowedDynamic: {
    hasSuspendedDynamic: boolean
    hasDynamicMetadata: boolean
    hasDynamicViewport: boolean
    syncDynamicExpression: string
    syncDynamicErrors: Array<Error>
    dynamicErrors: Array<Error>
  }
}

export function createDynamicTrackingState(
  isDebugDynamicAccesses: boolean | undefined
): DynamicTrackingState {
  return {
    isDebugDynamicAccesses,
    dynamicAccesses: [],
    disallowedDynamic: {
      hasSuspendedDynamic: false,
      hasDynamicMetadata: false,
      hasDynamicViewport: false,
      syncDynamicExpression: '',
      syncDynamicErrors: [],
      dynamicErrors: [],
    },
  }
}

export function getFirstDynamicReason(
  trackingState: DynamicTrackingState
): undefined | string {
  return trackingState.dynamicAccesses[0]?.expression
}

/**
 * This function communicates that the current scope should be treated as dynamic.
 *
 * In most cases this function is a no-op but if called during
 * a PPR prerender it will postpone the current sub-tree and calling
 * it during a normal prerender will cause the entire prerender to abort
 */
export function markCurrentScopeAsDynamic(
  store: WorkStore,
  workUnitStore: undefined | Exclude<WorkUnitStore, PrerenderStoreModern>,
  expression: string
): void {
  if (workUnitStore) {
    if (
      workUnitStore.type === 'cache' ||
      workUnitStore.type === 'unstable-cache'
    ) {
      // inside cache scopes marking a scope as dynamic has no effect because the outer cache scope
      // creates a cache boundary. This is subtly different from reading a dynamic data source which is
      // forbidden inside a cache scope.
      return
    }
  }

  // If we're forcing dynamic rendering or we're forcing static rendering, we
  // don't need to do anything here because the entire page is already dynamic
  // or it's static and it should not throw or postpone here.
  if (store.forceDynamic || store.forceStatic) return

  if (store.dynamicShouldError) {
    throw new StaticGenBailoutError(
      `Route ${store.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
    )
  }

  if (workUnitStore) {
    if (workUnitStore.type === 'prerender-ppr') {
      postponeWithTracking(
        store.route,
        expression,
        workUnitStore.dynamicTracking
      )
    } else if (workUnitStore.type === 'prerender-legacy') {
      workUnitStore.revalidate = 0

      // We aren't prerendering but we are generating a static page. We need to bail out of static generation
      const err = new DynamicServerError(
        `Route ${store.route} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`
      )
      store.dynamicUsageDescription = expression
      store.dynamicUsageStack = err.stack

      throw err
    } else if (
      process.env.NODE_ENV === 'development' &&
      workUnitStore &&
      workUnitStore.type === 'request'
    ) {
      workUnitStore.usedDynamic = true
    }
  }
}

/**
 * This function communicates that some dynamic path parameter was read. This
 * differs from the more general `trackDynamicDataAccessed` in that it is will
 * not error when `dynamic = "error"` is set.
 *
 * @param store The static generation store
 * @param expression The expression that was accessed dynamically
 */
export function trackFallbackParamAccessed(
  store: WorkStore,
  expression: string
): void {
  const prerenderStore = workUnitAsyncStorage.getStore()
  if (!prerenderStore || prerenderStore.type !== 'prerender-ppr') return

  postponeWithTracking(store.route, expression, prerenderStore.dynamicTracking)
}

/**
 * This function communicates that some dynamic data was read. This typically would refer to accessing
 * a Request specific data store such as cookies or headers. This function is not how end-users will
 * describe reading from dynamic data sources which are valid to cache and up to the author to make
 * a determination of when to do so.
 *
 * If we are inside a cache scope we error
 * Also during a PPR Prerender we postpone
 */
export function trackDynamicDataAccessed(
  store: WorkStore,
  workUnitStore: undefined | WorkUnitStore,
  expression: string
): void {
  if (workUnitStore) {
    if (workUnitStore.type === 'cache') {
      throw new Error(
        `Route ${store.route} used "${expression}" inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "${expression}" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
      )
    } else if (workUnitStore.type === 'unstable-cache') {
      throw new Error(
        `Route ${store.route} used "${expression}" inside a function cached with "unstable_cache(...)". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "${expression}" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
      )
    }
  }

  if (store.dynamicShouldError) {
    throw new StaticGenBailoutError(
      `Route ${store.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
    )
  }

  if (workUnitStore) {
    if (workUnitStore.type === 'prerender') {
      // dynamicIO Prerender
      abortAndThrowOnSynchronousDynamicDataAccess(
        store.route,
        expression,
        workUnitStore
      )
    } else if (workUnitStore.type === 'prerender-ppr') {
      // PPR Prerender
      postponeWithTracking(
        store.route,
        expression,
        workUnitStore.dynamicTracking
      )
    } else if (workUnitStore.type === 'prerender-legacy') {
      // legacy Prerender
      workUnitStore.revalidate = 0

      const err = new DynamicServerError(
        `Route ${store.route} couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`
      )
      store.dynamicUsageDescription = expression
      store.dynamicUsageStack = err.stack

      throw err
    } else if (
      process.env.NODE_ENV === 'development' &&
      workUnitStore &&
      workUnitStore.type === 'request'
    ) {
      workUnitStore.usedDynamic = true
    }
  }
}

/**
 * This function is meant to be used when prerendering without dynamicIO or PPR.
 * When called during a build it will cause Next.js to consider the route as dynamic.
 *
 * @internal
 */
export function throwToInterruptStaticGeneration(
  expression: string,
  store: WorkStore,
  prerenderStore: PrerenderStoreLegacy
): never {
  // We aren't prerendering but we are generating a static page. We need to bail out of static generation
  const err = new DynamicServerError(
    `Route ${store.route} couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`
  )

  prerenderStore.revalidate = 0

  store.dynamicUsageDescription = expression
  store.dynamicUsageStack = err.stack

  throw err
}

/**
 * This function should be used to track whether something dynamic happened even when
 * we are in a dynamic render. This is useful for Dev where all renders are dynamic but
 * we still track whether dynamic APIs were accessed for helpful messaging
 *
 * @internal
 */
export function trackDynamicDataInDynamicRender(
  _store: WorkStore,
  workUnitStore: void | WorkUnitStore
) {
  if (workUnitStore) {
    if (
      workUnitStore.type === 'cache' ||
      workUnitStore.type === 'unstable-cache'
    ) {
      // inside cache scopes marking a scope as dynamic has no effect because the outer cache scope
      // creates a cache boundary. This is subtly different from reading a dynamic data source which is
      // forbidden inside a cache scope.
      return
    }
    if (
      workUnitStore.type === 'prerender' ||
      workUnitStore.type === 'prerender-legacy'
    ) {
      workUnitStore.revalidate = 0
    }
    if (
      process.env.NODE_ENV === 'development' &&
      workUnitStore.type === 'request'
    ) {
      workUnitStore.usedDynamic = true
    }
  }
}

// Despite it's name we don't actually abort unless we have a controller to call abort on
// There are times when we let a prerender run long to discover caches where we want the semantics
// of tracking dynamic access without terminating the prerender early
export function abortOnSynchronousDynamicDataAccess(
  route: string,
  expression: string,
  prerenderStore: PrerenderStoreModern
): void {
  if (prerenderStore.dynamicTracking) {
    const disallowedDynamic = prerenderStore.dynamicTracking.disallowedDynamic
    if (disallowedDynamic.syncDynamicExpression === '') {
      disallowedDynamic.syncDynamicExpression = expression
    }
  }

  const reason = `Route ${route} needs to bail out of prerendering at this point because it used ${expression}.`

  const error = createPrerenderInterruptedError(reason)

  if (prerenderStore.controller) {
    prerenderStore.controller.abort(error)
  }

  const dynamicTracking = prerenderStore.dynamicTracking
  if (dynamicTracking) {
    dynamicTracking.dynamicAccesses.push({
      // When we aren't debugging, we don't need to create another error for the
      // stack trace.
      stack: dynamicTracking.isDebugDynamicAccesses
        ? new Error().stack
        : undefined,
      expression,
    })
  }
}

/**
 * use this function when prerendering with dynamicIO. If we are doing a
 * prospective prerender we don't actually abort because we want to discover
 * all caches for the shell. If this is the actual prerender we do abort.
 *
 * This function accepts a prerenderStore but the caller should ensure we're
 * actually running in dynamicIO mode.
 *
 *
 * @internal
 */
export function abortAndThrowOnSynchronousDynamicDataAccess(
  route: string,
  expression: string,
  prerenderStore: PrerenderStoreModern
): never {
  abortOnSynchronousDynamicDataAccess(route, expression, prerenderStore)
  throw createPrerenderInterruptedError(
    `Route ${route} needs to bail out of prerendering at this point because it used ${expression}.`
  )
}

/**
 * This component will call `React.postpone` that throws the postponed error.
 */
type PostponeProps = {
  reason: string
  route: string
}
export function Postpone({ reason, route }: PostponeProps): never {
  const prerenderStore = workUnitAsyncStorage.getStore()
  const dynamicTracking =
    prerenderStore && prerenderStore.type === 'prerender-ppr'
      ? prerenderStore.dynamicTracking
      : null
  postponeWithTracking(route, reason, dynamicTracking)
}

export function postponeWithTracking(
  route: string,
  expression: string,
  dynamicTracking: null | DynamicTrackingState
): never {
  assertPostpone()
  if (dynamicTracking) {
    dynamicTracking.dynamicAccesses.push({
      // When we aren't debugging, we don't need to create another error for the
      // stack trace.
      stack: dynamicTracking.isDebugDynamicAccesses
        ? new Error().stack
        : undefined,
      expression,
    })
  }

  React.unstable_postpone(createPostponeReason(route, expression))
}

function createPostponeReason(route: string, expression: string) {
  return (
    `Route ${route} needs to bail out of prerendering at this point because it used ${expression}. ` +
    `React throws this special object to indicate where. It should not be caught by ` +
    `your own try/catch. Learn more: https://nextjs.org/docs/messages/ppr-caught-error`
  )
}

export function isDynamicPostpone(err: unknown) {
  if (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as any).message === 'string'
  ) {
    return isDynamicPostponeReason((err as any).message)
  }
  return false
}

function isDynamicPostponeReason(reason: string) {
  return (
    reason.includes(
      'needs to bail out of prerendering at this point because it used'
    ) &&
    reason.includes(
      'Learn more: https://nextjs.org/docs/messages/ppr-caught-error'
    )
  )
}

if (isDynamicPostponeReason(createPostponeReason('%%%', '^^^')) === false) {
  throw new Error(
    'Invariant: isDynamicPostpone misidentified a postpone reason. This is a bug in Next.js'
  )
}

const NEXT_PRERENDER_INTERRUPTED = 'NEXT_PRERENDER_INTERRUPTED'

function createPrerenderInterruptedError(message: string): Error {
  const error = new Error(message)
  ;(error as any).digest = NEXT_PRERENDER_INTERRUPTED
  return error
}

type DigestError = Error & {
  digest: string
}

export function isPrerenderInterruptedError(
  error: unknown
): error is DigestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as any).digest === NEXT_PRERENDER_INTERRUPTED &&
    'name' in error &&
    'message' in error &&
    error instanceof Error
  )
}

export function accessedDynamicData(
  dynamicTracking: DynamicTrackingState
): boolean {
  return dynamicTracking.dynamicAccesses.length > 0
}

export function formatDynamicAPIAccesses(
  dynamicTracking: DynamicTrackingState
): string[] {
  return dynamicTracking.dynamicAccesses
    .filter(
      (access): access is Required<DynamicAccess> =>
        typeof access.stack === 'string' && access.stack.length > 0
    )
    .map(({ expression, stack }) => {
      stack = stack
        .split('\n')
        // Remove the "Error: " prefix from the first line of the stack trace as
        // well as the first 4 lines of the stack trace which is the distance
        // from the user code and the `new Error().stack` call.
        .slice(4)
        .filter((line) => {
          // Exclude Next.js internals from the stack trace.
          if (line.includes('node_modules/next/')) {
            return false
          }

          // Exclude anonymous functions from the stack trace.
          if (line.includes(' (<anonymous>)')) {
            return false
          }

          // Exclude Node.js internals from the stack trace.
          if (line.includes(' (node:')) {
            return false
          }

          return true
        })
        .join('\n')
      return `Dynamic API Usage Debug - ${expression}:\n${stack}`
    })
}

function assertPostpone() {
  if (!hasPostpone) {
    throw new Error(
      `Invariant: React.unstable_postpone is not defined. This suggests the wrong version of React was loaded. This is a bug in Next.js`
    )
  }
}

/**
 * This is a bit of a hack to allow us to abort a render using a Postpone instance instead of an Error which changes React's
 * abort semantics slightly.
 */
export function createPostponedAbortSignal(reason: string): AbortSignal {
  assertPostpone()
  const controller = new AbortController()
  // We get our hands on a postpone instance by calling postpone and catching the throw
  try {
    React.unstable_postpone(reason)
  } catch (x: unknown) {
    controller.abort(x)
  }
  return controller.signal
}

export function annotateDynamicAccess(
  expression: string,
  prerenderStore: PrerenderStoreModern
) {
  const dynamicTracking = prerenderStore.dynamicTracking
  if (dynamicTracking) {
    dynamicTracking.dynamicAccesses.push({
      stack: dynamicTracking.isDebugDynamicAccesses
        ? new Error().stack
        : undefined,
      expression,
    })
  }
}

export function useDynamicRouteParams(expression: string) {
  if (typeof window === 'undefined') {
    const workStore = workAsyncStorage.getStore()

    if (
      workStore &&
      workStore.isStaticGeneration &&
      workStore.fallbackRouteParams &&
      workStore.fallbackRouteParams.size > 0
    ) {
      // There are fallback route params, we should track these as dynamic
      // accesses.
      const workUnitStore = workUnitAsyncStorage.getStore()
      if (workUnitStore) {
        // We're prerendering with dynamicIO or PPR or both
        if (workUnitStore.type === 'prerender') {
          // We are in a prerender with dynamicIO semantics
          // We are going to hang here and never resolve. This will cause the currently
          // rendering component to effectively be a dynamic hole
          React.use(makeHangingPromise(workUnitStore.renderSignal, expression))
        } else if (workUnitStore.type === 'prerender-ppr') {
          // We're prerendering with PPR
          postponeWithTracking(
            workStore.route,
            expression,
            workUnitStore.dynamicTracking
          )
        } else if (workUnitStore.type === 'prerender-legacy') {
          throwToInterruptStaticGeneration(expression, workStore, workUnitStore)
        }
      }
    }
  }
}

const hasSuspenseRegex = /\n\s+at Suspense \(<anonymous>\)/
const hasMetadataRegex = new RegExp(
  `\\n\\s+at ${METADATA_BOUNDARY_NAME}[\\n\\s]`
)
const hasViewportRegex = new RegExp(
  `\\n\\s+at ${VIEWPORT_BOUNDARY_NAME}[\\n\\s]`
)
const hasOutletRegex = new RegExp(`\\n\\s+at ${OUTLET_BOUNDARY_NAME}[\\n\\s]`)

export function trackAllowedDynamicAccess(
  route: string,
  thrownValue: Error,
  componentStack: string,
  dynamicTracking: DynamicTrackingState
) {
  const disallowedDynamic = dynamicTracking.disallowedDynamic
  if (hasSuspenseRegex.test(componentStack)) {
    disallowedDynamic.hasSuspendedDynamic = true
    return
  } else if (hasOutletRegex.test(componentStack)) {
    // We don't need to track that this is dynamic. It is only so when something else is also dynamic.
    return
  } else if (hasMetadataRegex.test(componentStack)) {
    disallowedDynamic.hasDynamicMetadata = true
    return
  } else if (hasViewportRegex.test(componentStack)) {
    disallowedDynamic.hasDynamicViewport = true
    return
  } else if (isPrerenderInterruptedError(thrownValue)) {
    const syncDynamicExpression = disallowedDynamic.syncDynamicExpression
    let message: string
    if (syncDynamicExpression) {
      message = `Route ${route} used a synchronous Dynamic API: ${syncDynamicExpression}, which caused this component to not finish rendering before the prerender completed and no fallback UI was defined.`
    } else {
      message = `Route ${route} used a synchronous Dynamic API which caused this component to not finish rendering before the prerender completed and no fallback UI was defined.`
    }
    const error = createErrorWithComponentStack(message, componentStack)
    disallowedDynamic.syncDynamicErrors.push(error)
    return
  } else if (disallowedDynamic.syncDynamicExpression) {
    const message = `Route ${route} used a synchronous Dynamic API: ${disallowedDynamic.syncDynamicExpression}. This particular component may have been dynamic anyway or it may have just not finished before the synchronous Dynamic API was invoked.`
    const error = createErrorWithComponentStack(message, componentStack)
    disallowedDynamic.syncDynamicErrors.push(error)
    return
  } else {
    // The thrownValue must have been the RENDER_COMPLETE abortReason because the only kinds of errors tracked here are
    // interrupts or render completes
    const message = `Route ${route} performed an IO operation that was not cached and no Suspense boundary was found to define a fallback UI.`
    const error = createErrorWithComponentStack(message, componentStack)
    disallowedDynamic.dynamicErrors.push(error)
    return
  }
}

function createErrorWithComponentStack(
  message: string,
  componentStack: string
) {
  const error = new Error(message)
  error.stack = 'Error: ' + message + componentStack
  return error
}

export function throwIfDisallowedDynamic(
  workStore: WorkStore,
  dynamicTracking: DynamicTrackingState
): void {
  const disallowedDynamic = dynamicTracking.disallowedDynamic
  const syncDynamicErrors = disallowedDynamic.syncDynamicErrors
  if (syncDynamicErrors.length) {
    for (let i = 0; i < syncDynamicErrors.length; i++) {
      console.error(syncDynamicErrors[i])
    }
    const expression =
      disallowedDynamic.syncDynamicExpression || 'a synchronous Dynamic API'
    throw new StaticGenBailoutError(
      `Route ${workStore.route} used ${expression} while prerendering which caused some part of the page to be dynamic without a Suspense boundary above it defining a fallback UI. It is best to avoid synchronous Dynamic API access during prerendering.`
    )
  }

  const dynamicErrors = disallowedDynamic.dynamicErrors
  if (dynamicErrors.length) {
    for (let i = 0; i < dynamicErrors.length; i++) {
      console.error(dynamicErrors[i])
    }
    throw new StaticGenBailoutError(
      `Route ${workStore.route} has one or more dynamic components without a defined fallback UI. Render dynamic components inside a Suspense boundary to indicate what the appropriate fallback UI should be.`
    )
  }

  if (!disallowedDynamic.hasSuspendedDynamic) {
    if (disallowedDynamic.hasDynamicMetadata) {
      if (disallowedDynamic.syncDynamicExpression) {
        throw new StaticGenBailoutError(
          `Route ${workStore.route} used ${disallowedDynamic.syncDynamicExpression} before Next.js could finish rendering metadata.`
        )
      }
      throw new StaticGenBailoutError(
        `Route ${workStore.route} has a dynamic \`generateMetadata\` but nothing else is dynamic. Try updating your \`generateMetadata\` to use cached data or ensure your route has at least one dynamic component in the a Page or Layout.`
      )
    } else if (disallowedDynamic.hasDynamicViewport) {
      if (disallowedDynamic.syncDynamicExpression) {
        throw new StaticGenBailoutError(
          `Route ${workStore.route} used ${disallowedDynamic.syncDynamicExpression} before Next.js could finish rendering viewport.`
        )
      }
      throw new StaticGenBailoutError(
        `Route ${workStore.route} has a dynamic \`generateViewport\` but nothing else is dynamic. Try updating your \`generateViewport\` to use cached data or ensure your route has at least one dynamic component in the a Page or Layout.`
      )
    }
  }
}
