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
import type {
  WorkUnitStore,
  RequestStore,
  PrerenderStoreLegacy,
  PrerenderStoreModern,
  PrerenderStoreModernRuntime,
} from '../app-render/work-unit-async-storage.external'

// Once postpone is in stable we should switch to importing the postpone export directly
import React from 'react'

import { DynamicServerError } from '../../client/components/hooks-server-context'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import {
  getRuntimeStagePromise,
  throwForMissingRequestStore,
  workUnitAsyncStorage,
} from './work-unit-async-storage.external'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import {
  METADATA_BOUNDARY_NAME,
  VIEWPORT_BOUNDARY_NAME,
  OUTLET_BOUNDARY_NAME,
  ROOT_LAYOUT_BOUNDARY_NAME,
} from '../../lib/framework/boundary-constants'
import { scheduleOnNextTick } from '../../lib/scheduler'
import { BailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { InvariantError } from '../../shared/lib/invariant-error'
import { RenderStage } from './staged-rendering'

const hasPostpone = typeof React.unstable_postpone === 'function'

export type DynamicAccess = {
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

// Stores dynamic reasons used during an RSC render.
export type DynamicTrackingState = {
  /**
   * When true, stack information will also be tracked during dynamic access.
   */
  readonly isDebugDynamicAccesses: boolean | undefined

  /**
   * The dynamic accesses that occurred during the render.
   */
  readonly dynamicAccesses: Array<DynamicAccess>

  syncDynamicErrorWithStack: null | Error
}

// Stores dynamic reasons used during an SSR render.
export type DynamicValidationState = {
  hasSuspenseAboveBody: boolean
  hasDynamicMetadata: boolean
  hasDynamicViewport: boolean
  hasAllowedDynamic: boolean
  dynamicErrors: Array<Error>
}

export function createDynamicTrackingState(
  isDebugDynamicAccesses: boolean | undefined
): DynamicTrackingState {
  return {
    isDebugDynamicAccesses,
    dynamicAccesses: [],
    syncDynamicErrorWithStack: null,
  }
}

export function createDynamicValidationState(): DynamicValidationState {
  return {
    hasSuspenseAboveBody: false,
    hasDynamicMetadata: false,
    hasDynamicViewport: false,
    hasAllowedDynamic: false,
    dynamicErrors: [],
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
    switch (workUnitStore.type) {
      case 'cache':
      case 'unstable-cache':
        // Inside cache scopes, marking a scope as dynamic has no effect,
        // because the outer cache scope creates a cache boundary. This is
        // subtly different from reading a dynamic data source, which is
        // forbidden inside a cache scope.
        return
      case 'private-cache':
        // A private cache scope is already dynamic by definition.
        return
      case 'prerender-legacy':
      case 'prerender-ppr':
      case 'request':
        break
      default:
        workUnitStore satisfies never
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
    switch (workUnitStore.type) {
      case 'prerender-ppr':
        return postponeWithTracking(
          store.route,
          expression,
          workUnitStore.dynamicTracking
        )
      case 'prerender-legacy':
        workUnitStore.revalidate = 0

        // We aren't prerendering, but we are generating a static page. We need
        // to bail out of static generation.
        const err = new DynamicServerError(
          `Route ${store.route} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`
        )
        store.dynamicUsageDescription = expression
        store.dynamicUsageStack = err.stack

        throw err
      case 'request':
        if (process.env.NODE_ENV !== 'production') {
          workUnitStore.usedDynamic = true
        }
        break
      default:
        workUnitStore satisfies never
    }
  }
}

/**
 * This function is meant to be used when prerendering without cacheComponents or PPR.
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
export function trackDynamicDataInDynamicRender(workUnitStore: WorkUnitStore) {
  switch (workUnitStore.type) {
    case 'cache':
    case 'unstable-cache':
      // Inside cache scopes, marking a scope as dynamic has no effect,
      // because the outer cache scope creates a cache boundary. This is
      // subtly different from reading a dynamic data source, which is
      // forbidden inside a cache scope.
      return
    case 'private-cache':
      // A private cache scope is already dynamic by definition.
      return
    case 'prerender':
    case 'prerender-runtime':
    case 'prerender-legacy':
    case 'prerender-ppr':
    case 'prerender-client':
      break
    case 'request':
      if (process.env.NODE_ENV !== 'production') {
        workUnitStore.usedDynamic = true
      }
      break
    default:
      workUnitStore satisfies never
  }
}

function abortOnSynchronousDynamicDataAccess(
  route: string,
  expression: string,
  prerenderStore: PrerenderStoreModern
): void {
  const reason = `Route ${route} needs to bail out of prerendering at this point because it used ${expression}.`

  const error = createPrerenderInterruptedError(reason)

  prerenderStore.controller.abort(error)

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

export function abortOnSynchronousPlatformIOAccess(
  route: string,
  expression: string,
  errorWithStack: Error,
  prerenderStore: PrerenderStoreModern
): void {
  const dynamicTracking = prerenderStore.dynamicTracking
  abortOnSynchronousDynamicDataAccess(route, expression, prerenderStore)
  // It is important that we set this tracking value after aborting. Aborts are executed
  // synchronously except for the case where you abort during render itself. By setting this
  // value late we can use it to determine if any of the aborted tasks are the task that
  // called the sync IO expression in the first place.
  if (dynamicTracking) {
    if (dynamicTracking.syncDynamicErrorWithStack === null) {
      dynamicTracking.syncDynamicErrorWithStack = errorWithStack
    }
  }
}

export function trackSynchronousPlatformIOAccessInDev(
  requestStore: RequestStore
): void {
  // We don't actually have a controller to abort but we do the semantic equivalent by
  // advancing the request store out of the prerender stage
  if (requestStore.stagedRendering) {
    // TODO: error for sync IO in the runtime stage
    // (which is not currently covered by the validation render in `spawnDynamicValidationInDev`)
    requestStore.stagedRendering.advanceStage(RenderStage.Dynamic)
  }
}

/**
 * use this function when prerendering with cacheComponents. If we are doing a
 * prospective prerender we don't actually abort because we want to discover
 * all caches for the shell. If this is the actual prerender we do abort.
 *
 * This function accepts a prerenderStore but the caller should ensure we're
 * actually running in cacheComponents mode.
 *
 * @internal
 */
export function abortAndThrowOnSynchronousRequestDataAccess(
  route: string,
  expression: string,
  errorWithStack: Error,
  prerenderStore: PrerenderStoreModern
): never {
  const prerenderSignal = prerenderStore.controller.signal
  if (prerenderSignal.aborted === false) {
    // TODO it would be better to move this aborted check into the callsite so we can avoid making
    // the error object when it isn't relevant to the aborting of the prerender however
    // since we need the throw semantics regardless of whether we abort it is easier to land
    // this way. See how this was handled with `abortOnSynchronousPlatformIOAccess` for a closer
    // to ideal implementation
    abortOnSynchronousDynamicDataAccess(route, expression, prerenderStore)
    // It is important that we set this tracking value after aborting. Aborts are executed
    // synchronously except for the case where you abort during render itself. By setting this
    // value late we can use it to determine if any of the aborted tasks are the task that
    // called the sync IO expression in the first place.
    const dynamicTracking = prerenderStore.dynamicTracking
    if (dynamicTracking) {
      if (dynamicTracking.syncDynamicErrorWithStack === null) {
        dynamicTracking.syncDynamicErrorWithStack = errorWithStack
      }
    }
  }
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
  dynamicAccesses: Array<DynamicAccess>
): boolean {
  return dynamicAccesses.length > 0
}

export function consumeDynamicAccess(
  serverDynamic: DynamicTrackingState,
  clientDynamic: DynamicTrackingState
): DynamicTrackingState['dynamicAccesses'] {
  // We mutate because we only call this once we are no longer writing
  // to the dynamicTrackingState and it's more efficient than creating a new
  // array.
  serverDynamic.dynamicAccesses.push(...clientDynamic.dynamicAccesses)
  return serverDynamic.dynamicAccesses
}

export function formatDynamicAPIAccesses(
  dynamicAccesses: Array<DynamicAccess>
): string[] {
  return dynamicAccesses
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
export function createRenderInBrowserAbortSignal(): AbortSignal {
  const controller = new AbortController()
  controller.abort(new BailoutToCSRError('Render in Browser'))
  return controller.signal
}

/**
 * In a prerender, we may end up with hanging Promises as inputs due them
 * stalling on connection() or because they're loading dynamic data. In that
 * case we need to abort the encoding of arguments since they'll never complete.
 */
export function createHangingInputAbortSignal(
  workUnitStore: WorkUnitStore
): AbortSignal | undefined {
  switch (workUnitStore.type) {
    case 'prerender':
    case 'prerender-runtime':
      const controller = new AbortController()

      if (workUnitStore.cacheSignal) {
        // If we have a cacheSignal it means we're in a prospective render. If
        // the input we're waiting on is coming from another cache, we do want
        // to wait for it so that we can resolve this cache entry too.
        workUnitStore.cacheSignal.inputReady().then(() => {
          controller.abort()
        })
      } else {
        // Otherwise we're in the final render and we should already have all
        // our caches filled.
        // If the prerender uses stages, we have wait until the runtime stage,
        // at which point all runtime inputs will be resolved.
        // (otherwise, a runtime prerender might consider `cookies()` hanging
        //  even though they'd resolve in the next task.)
        //
        // We might still be waiting on some microtasks so we
        // wait one tick before giving up. When we give up, we still want to
        // render the content of this cache as deeply as we can so that we can
        // suspend as deeply as possible in the tree or not at all if we don't
        // end up waiting for the input.
        const runtimeStagePromise = getRuntimeStagePromise(workUnitStore)
        if (runtimeStagePromise) {
          runtimeStagePromise.then(() =>
            scheduleOnNextTick(() => controller.abort())
          )
        } else {
          scheduleOnNextTick(() => controller.abort())
        }
      }

      return controller.signal
    case 'prerender-client':
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'request':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
      return undefined
    default:
      workUnitStore satisfies never
  }
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
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workStore && workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender-client':
      case 'prerender': {
        const fallbackParams = workUnitStore.fallbackRouteParams

        if (fallbackParams && fallbackParams.size > 0) {
          // We are in a prerender with cacheComponents semantics. We are going to
          // hang here and never resolve. This will cause the currently
          // rendering component to effectively be a dynamic hole.
          React.use(
            makeHangingPromise(
              workUnitStore.renderSignal,
              workStore.route,
              expression
            )
          )
        }
        break
      }
      case 'prerender-ppr': {
        const fallbackParams = workUnitStore.fallbackRouteParams
        if (fallbackParams && fallbackParams.size > 0) {
          return postponeWithTracking(
            workStore.route,
            expression,
            workUnitStore.dynamicTracking
          )
        }
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
    case 'prerender-client': {
      React.use(
        makeHangingPromise(
          workUnitStore.renderSignal,
          workStore.route,
          expression
        )
      )
      break
    }
    case 'prerender-legacy':
    case 'prerender-ppr': {
      if (workStore.forceStatic) {
        return
      }
      throw new BailoutToCSRError(expression)
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
    case 'request':
      return
    default:
      workUnitStore satisfies never
  }
}

const hasSuspenseRegex = /\n\s+at Suspense \(<anonymous>\)/

// Common implicit body tags that React will treat as body when placed directly in html
const bodyAndImplicitTags =
  'body|div|main|section|article|aside|header|footer|nav|form|p|span|h1|h2|h3|h4|h5|h6'

// Detects when RootLayoutBoundary (our framework marker component) appears
// after Suspense in the component stack, indicating the root layout is wrapped
// within a Suspense boundary. Ensures no body/html/implicit-body components are in between.
//
// Example matches:
//   at Suspense (<anonymous>)
//   at __next_root_layout_boundary__ (<anonymous>)
//
// Or with other components in between (but not body/html/implicit-body):
//   at Suspense (<anonymous>)
//   at SomeComponent (<anonymous>)
//   at __next_root_layout_boundary__ (<anonymous>)
const hasSuspenseBeforeRootLayoutWithoutBodyOrImplicitBodyRegex = new RegExp(
  `\\n\\s+at Suspense \\(<anonymous>\\)(?:(?!\\n\\s+at (?:${bodyAndImplicitTags}) \\(<anonymous>\\))[\\s\\S])*?\\n\\s+at ${ROOT_LAYOUT_BOUNDARY_NAME} \\([^\\n]*\\)`
)

const hasMetadataRegex = new RegExp(
  `\\n\\s+at ${METADATA_BOUNDARY_NAME}[\\n\\s]`
)
const hasViewportRegex = new RegExp(
  `\\n\\s+at ${VIEWPORT_BOUNDARY_NAME}[\\n\\s]`
)
const hasOutletRegex = new RegExp(`\\n\\s+at ${OUTLET_BOUNDARY_NAME}[\\n\\s]`)

export function trackAllowedDynamicAccess(
  workStore: WorkStore,
  componentStack: string,
  dynamicValidation: DynamicValidationState,
  clientDynamic: DynamicTrackingState
) {
  if (hasOutletRegex.test(componentStack)) {
    // We don't need to track that this is dynamic. It is only so when something else is also dynamic.
    return
  } else if (hasMetadataRegex.test(componentStack)) {
    dynamicValidation.hasDynamicMetadata = true
    return
  } else if (hasViewportRegex.test(componentStack)) {
    dynamicValidation.hasDynamicViewport = true
    return
  } else if (
    hasSuspenseBeforeRootLayoutWithoutBodyOrImplicitBodyRegex.test(
      componentStack
    )
  ) {
    // For Suspense within body, the prelude wouldn't be empty so it wouldn't violate the empty static shells rule.
    // But if you have Suspense above body, the prelude is empty but we allow that because having Suspense
    // is an explicit signal from the user that they acknowledge the empty shell and want dynamic rendering.
    dynamicValidation.hasAllowedDynamic = true
    dynamicValidation.hasSuspenseAboveBody = true
    return
  } else if (hasSuspenseRegex.test(componentStack)) {
    // this error had a Suspense boundary above it so we don't need to report it as a source
    // of disallowed
    dynamicValidation.hasAllowedDynamic = true
    return
  } else if (clientDynamic.syncDynamicErrorWithStack) {
    // This task was the task that called the sync error.
    dynamicValidation.dynamicErrors.push(
      clientDynamic.syncDynamicErrorWithStack
    )
    return
  } else {
    const message = `Route "${workStore.route}": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense`
    const error = createErrorWithComponentOrOwnerStack(message, componentStack)
    dynamicValidation.dynamicErrors.push(error)
    return
  }
}

/**
 * In dev mode, we prefer using the owner stack, otherwise the provided
 * component stack is used.
 */
function createErrorWithComponentOrOwnerStack(
  message: string,
  componentStack: string
) {
  const ownerStack =
    process.env.NODE_ENV !== 'production' && React.captureOwnerStack
      ? React.captureOwnerStack()
      : null

  const error = new Error(message)
  error.stack = error.name + ': ' + message + (ownerStack ?? componentStack)
  return error
}

export enum PreludeState {
  Full = 0,
  Empty = 1,
  Errored = 2,
}

export function logDisallowedDynamicError(
  workStore: WorkStore,
  error: Error
): void {
  console.error(error)

  if (!workStore.dev) {
    if (workStore.hasReadableErrorStacks) {
      console.error(
        `To get a more detailed stack trace and pinpoint the issue, start the app in development mode by running \`next dev\`, then open "${workStore.route}" in your browser to investigate the error.`
      )
    } else {
      console.error(`To get a more detailed stack trace and pinpoint the issue, try one of the following:
  - Start the app in development mode by running \`next dev\`, then open "${workStore.route}" in your browser to investigate the error.
  - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.`)
    }
  }
}

export function throwIfDisallowedDynamic(
  workStore: WorkStore,
  prelude: PreludeState,
  dynamicValidation: DynamicValidationState,
  serverDynamic: DynamicTrackingState
): void {
  if (serverDynamic.syncDynamicErrorWithStack) {
    logDisallowedDynamicError(
      workStore,
      serverDynamic.syncDynamicErrorWithStack
    )
    throw new StaticGenBailoutError()
  }

  if (prelude !== PreludeState.Full) {
    if (dynamicValidation.hasSuspenseAboveBody) {
      // This route has opted into allowing fully dynamic rendering
      // by including a Suspense boundary above the body. In this case
      // a lack of a shell is not considered disallowed so we simply return
      return
    }

    // We didn't have any sync bailouts but there may be user code which
    // blocked the root. We would have captured these during the prerender
    // and can log them here and then terminate the build/validating render
    const dynamicErrors = dynamicValidation.dynamicErrors
    if (dynamicErrors.length > 0) {
      for (let i = 0; i < dynamicErrors.length; i++) {
        logDisallowedDynamicError(workStore, dynamicErrors[i])
      }

      throw new StaticGenBailoutError()
    }

    // If we got this far then the only other thing that could be blocking
    // the root is dynamic Viewport. If this is dynamic then
    // you need to opt into that by adding a Suspense boundary above the body
    // to indicate your are ok with fully dynamic rendering.
    if (dynamicValidation.hasDynamicViewport) {
      console.error(
        `Route "${workStore.route}" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
      )
      throw new StaticGenBailoutError()
    }

    if (prelude === PreludeState.Empty) {
      // If we ever get this far then we messed up the tracking of invalid dynamic.
      // We still adhere to the constraint that you must produce a shell but invite the
      // user to report this as a bug in Next.js.
      console.error(
        `Route "${workStore.route}" did not produce a static shell and Next.js was unable to determine a reason. This is a bug in Next.js.`
      )
      throw new StaticGenBailoutError()
    }
  } else {
    if (
      dynamicValidation.hasAllowedDynamic === false &&
      dynamicValidation.hasDynamicMetadata
    ) {
      console.error(
        `Route "${workStore.route}" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
      )
      throw new StaticGenBailoutError()
    }
  }
}

export function delayUntilRuntimeStage<T>(
  prerenderStore: PrerenderStoreModernRuntime,
  result: Promise<T>
): Promise<T> {
  if (prerenderStore.runtimeStagePromise) {
    return prerenderStore.runtimeStagePromise.then(() => result)
  }
  return result
}
