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

import type { WorkStore } from './work-async-storage.external'
import type {
  RequestStore,
  WorkUnitStore,
  PrerenderStoreLegacy,
  PrerenderStoreModern,
  ValidationStoreClient,
  PrerenderStoreModernServer,
} from './work-unit-async-storage.external'
import { DynamicServerError } from '../../client/components/hooks-server-context'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { getStagedRenderingController } from './work-unit-async-storage.external'
import { scheduleOnNextTick } from '../../lib/scheduler'

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
  syncDynamicErrorWithStackPostMicrotask: boolean
}

export function createDynamicTrackingState(
  isDebugDynamicAccesses: boolean | undefined
): DynamicTrackingState {
  return {
    isDebugDynamicAccesses,
    dynamicAccesses: [],
    syncDynamicErrorWithStack: null,
    syncDynamicErrorWithStackPostMicrotask: false,
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
      case 'request':
      case 'build-time-generator':
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
        markRequestStoreAsDynamic(workUnitStore)
        break
      case 'build-time-generator':
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
    case 'prerender-client':
    case 'validation-client':
    case 'build-time-generator':
      break
    case 'request':
      markRequestStoreAsDynamic(workUnitStore)
      break
    default:
      workUnitStore satisfies never
  }
}

function markRequestStoreAsDynamic(requestStore: RequestStore): void {
  if (process.env.__NEXT_DEV_SERVER && requestStore.phase === 'render') {
    requestStore.usedDynamic = true
  }
}

function abortOnSynchronousDynamicDataAccess(
  _route: string,
  expression: string,
  prerenderStore: PrerenderStoreModern
): void {
  // Reuse the module-level reason. Constructing `new Error()` here would
  // capture Server Component CallSites on the abort reason; a retained
  // AbortSignal then pins the whole render graph.
  prerenderStore.controller.abort(prerenderInterruptedError)

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

  if (dynamicTracking && dynamicTracking.syncDynamicErrorWithStack === null) {
    dynamicTracking.syncDynamicErrorWithStack = errorWithStack
    // React completes the task that is currently rendering before scheduled
    // abort cleanup. Client tracking can attribute the sync IO only during
    // that current task; server tracking keeps the error regardless.
    queueMicrotask(() => {
      dynamicTracking.syncDynamicErrorWithStackPostMicrotask = true
    })
  }

  abortOnSynchronousDynamicDataAccess(route, expression, prerenderStore)
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
    // Preserve the exact server-side dynamic access for final validation after
    // interrupting this render.
    const dynamicTracking = prerenderStore.dynamicTracking
    if (dynamicTracking) {
      if (dynamicTracking.syncDynamicErrorWithStack === null) {
        dynamicTracking.syncDynamicErrorWithStack = errorWithStack
      }
    }
  }
  throw prerenderInterruptedError
}

const NEXT_PRERENDER_INTERRUPTED = 'NEXT_PRERENDER_INTERRUPTED'

// Constructed once at module load. A per-render `new Error()` used as
// `AbortSignal.reason` captures Server Component frames, so a retained
// signal pins the render graph. The expression that interrupted the
// prerender is recorded on `dynamicTracking` instead.
const prerenderInterruptedError: Error & { digest: string } = Object.assign(
  new Error('Prerender interrupted.'),
  { digest: NEXT_PRERENDER_INTERRUPTED }
)

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

/**
 * In a prerender, we may end up with hanging Promises as inputs due them
 * stalling on connection() or because they're loading dynamic data. In that
 * case we need to abort the encoding of arguments since they'll never complete.
 */
export function createHangingInputAbortSignal(
  workUnitStore: PrerenderStoreModernServer
): AbortSignal
export function createHangingInputAbortSignal(
  workUnitStore: WorkUnitStore
): AbortSignal | undefined
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
        // If the prerender uses stages, we have wait until the final stage.
        // if an input didn't resolve at that point, then we can assume it never will.
        //
        // We might still be waiting on some microtasks so we
        // wait one tick before giving up. When we give up, we still want to
        // render the content of this cache as deeply as we can so that we can
        // suspend as deeply as possible in the tree or not at all if we don't
        // end up waiting for the input.

        const stagedRendering = getStagedRenderingController(workUnitStore)
        if (stagedRendering && stagedRendering.finalStage !== null) {
          stagedRendering
            .waitForStage(stagedRendering.finalStage)
            .then(() => scheduleOnNextTick(() => controller.abort()), noop)
        } else {
          scheduleOnNextTick(() => controller.abort())
        }
      }

      return controller.signal
    case 'prerender-client':
    case 'validation-client':
    case 'prerender-legacy':
    case 'request':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'build-time-generator':
      return undefined
    default:
      workUnitStore satisfies never
  }
}

function noop() {}

export function annotateDynamicAccess(
  expression: string,
  prerenderStore: PrerenderStoreModern | ValidationStoreClient
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
