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
  PrerenderStoreLegacy,
  PrerenderStoreModern,
  ValidationStoreClient,
} from '../app-render/work-unit-async-storage.external'

// Once postpone is in stable we should switch to importing the postpone export directly
import React from 'react'

import { DynamicServerError } from '../../client/components/hooks-server-context'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import {
  getStagedRenderingController,
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
import {
  createRuntimeBodyError,
  createDynamicBodyError,
  createRuntimeBodyErrorInNavigation,
  createDynamicBodyErrorInNavigation,
  createDynamicOrRuntimeBodyError,
  createRuntimeMetadataError,
  createDynamicMetadataError,
  createRuntimeViewportError,
  createDynamicViewportError,
  createDynamicOrRuntimeViewportError,
  createDynamicOrRuntimeMetadataError,
  logBuildDebugHint,
} from './blocking-route-messages'
import { InvariantError } from '../../shared/lib/invariant-error'
import {
  INSTANT_VALIDATION_BOUNDARY_NAME,
  INSTANT_SLOT_MARKER_PREFIX,
  INSTANT_SLOT_MARKER_SUFFIX,
} from './instant-validation/boundary-constants'
import {
  type ValidationBoundaryTracking,
  allRequiredBoundariesRendered,
} from './instant-validation/boundary-tracking'
import type { InstantValidationSampleTracking } from './instant-validation/instant-samples'

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
  syncDynamicErrorWithStackPostMicrotask: boolean
}

// Stores dynamic reasons used during an SSR render.
export type DynamicValidationState = {
  hasSuspenseAboveBody: boolean
  hasDynamicMetadata: boolean
  dynamicMetadata: null | Error
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
    syncDynamicErrorWithStackPostMicrotask: false,
  }
}

export function createDynamicValidationState(): DynamicValidationState {
  return {
    hasSuspenseAboveBody: false,
    hasDynamicMetadata: false,
    dynamicMetadata: null,
    hasDynamicViewport: false,
    hasAllowedDynamic: false,
    dynamicErrors: [],
  }
}

function getPendingClientSyncDynamicError(
  clientDynamic: DynamicTrackingState
): null | Error {
  return clientDynamic.syncDynamicErrorWithStackPostMicrotask
    ? null
    : clientDynamic.syncDynamicErrorWithStack
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
      case 'generate-static-params':
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
      case 'generate-static-params':
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
    case 'validation-client':
    case 'generate-static-params':
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
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'request':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'generate-static-params':
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

const hasInstantValidationBoundaryRegex = new RegExp(
  `\\n\\s+at ${INSTANT_VALIDATION_BOUNDARY_NAME}[\\n\\s]`
)
const slotMarkerRegex = new RegExp(
  `\\n\\s+at ${INSTANT_SLOT_MARKER_PREFIX}(\\d+)${INSTANT_SLOT_MARKER_SUFFIX}[\\n\\s]`
)

/** Look up the config factory for the slot this error belongs to.
 * Checks the component stack for a slot marker (__next_instant_slot_N__)
 * and returns the config at that index. Falls back to index 0 (root
 * config) when no slot marker is found or the slot has no config. */
function resolveInstantStack(
  componentStack: string,
  dynamicValidation: InstantValidationState
): (() => Error) | null {
  const { slotStacks } = dynamicValidation
  if (slotStacks.length > 1) {
    const match = slotMarkerRegex.exec(componentStack)
    if (match) {
      // Slot markers are 0-indexed in the component name but
      // slotStacks is 1-indexed (index 0 is the root config).
      const slotIndex = parseInt(match[1], 10) + 1
      const slotStack = slotStacks[slotIndex]
      if (slotStack != null) {
        return slotStack
      }
    }
  }
  // Fall back to root config (index 0)
  return slotStacks[0] ?? null
}

/**
 * Inspects the component stack of an outlet boundary to discover whether the
 * user placed a Suspense boundary above the document body, and records the
 * opt-in on `dynamicValidation.hasSuspenseAboveBody` if so.
 *
 * The outlet itself isn't a meaningful source of dynamic — it only resolves
 * when metadata/viewport are dynamic, which we track via their own boundaries.
 * However, the outlet renders alongside the page content, so its stack passes
 * through the user's layout chain (typically reaching into `<body>` via the
 * root layout). That makes the outlet stack our best opportunity to spot a
 * Suspense boundary above the body, even when no real body content is dynamic.
 * Without this, a route whose only dynamic source is `generateViewport()` would
 * miss the Suspense-above-body opt-in, because the viewport's stack lives in
 * the head and never sees the user's root layout.
 *
 * We deliberately only set `hasSuspenseAboveBody`, not `hasAllowedDynamic`. The
 * latter tracks whether the body has dynamic content that's been wrapped in
 * Suspense (i.e., the page is partially dynamic). The outlet rendering tells us
 * about the structural opt-in for an empty shell, not about the body being
 * partially dynamic. The distinction matters because dynamic metadata is only
 * acceptable when the page is partially dynamic (via real body holes), and we
 * don't want this outlet-based detection to mask that case.
 */
function trackOutletSuspenseAboveBody(
  componentStack: string,
  dynamicValidation: DynamicValidationState
): void {
  if (
    hasSuspenseBeforeRootLayoutWithoutBodyOrImplicitBodyRegex.test(
      componentStack
    )
  ) {
    dynamicValidation.hasSuspenseAboveBody = true
  }
}

export function trackAllowedDynamicAccess(
  workStore: WorkStore,
  componentStack: string,
  dynamicValidation: DynamicValidationState,
  clientDynamic: DynamicTrackingState
) {
  const syncDynamicError = getPendingClientSyncDynamicError(clientDynamic)

  if (hasOutletRegex.test(componentStack)) {
    trackOutletSuspenseAboveBody(componentStack, dynamicValidation)
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
  } else if (syncDynamicError) {
    dynamicValidation.dynamicErrors.push(syncDynamicError)
    return
  } else {
    const error = addErrorContext(
      createDynamicOrRuntimeBodyError(workStore.route),
      componentStack,
      null
    )
    dynamicValidation.dynamicErrors.push(error)
    return
  }
}

export enum DynamicHoleKind {
  /** We know that this hole is caused by runtime data. */
  Runtime = 1,
  /** We know that this hole is caused by dynamic data. */
  Dynamic = 2,
}

/** Stores dynamic reasons used during an SSR render in instant validation. */
export type InstantValidationState = {
  hasDynamicMetadata: boolean
  hasAllowedClientDynamicAboveBoundary: boolean
  dynamicMetadata: null | Error
  hasDynamicViewport: boolean
  hasAllowedDynamic: boolean
  dynamicErrors: Array<Error>
  validationPreventingErrors: Array<Error>
  thrownErrorsOutsideBoundary: Array<unknown>
  /** Per-slot config factories. Index 0 is the root config (fallback).
   * Indices 1+ correspond to slot marker components in the tree. */
  slotStacks: Array<(() => Error) | null>
}

export function createInstantValidationState(
  slotStacks: Array<(() => Error) | null>
): InstantValidationState {
  return {
    hasDynamicMetadata: false,
    hasAllowedClientDynamicAboveBoundary: false,
    dynamicMetadata: null,
    hasDynamicViewport: false,
    hasAllowedDynamic: false,
    dynamicErrors: [],
    validationPreventingErrors: [],
    thrownErrorsOutsideBoundary: [],
    slotStacks,
  }
}

export function trackDynamicHoleInNavigation(
  workStore: WorkStore,
  componentStack: string,
  dynamicValidation: InstantValidationState,
  clientDynamic: DynamicTrackingState,
  kind: DynamicHoleKind,
  boundaryState: ValidationBoundaryTracking
) {
  const syncDynamicError = getPendingClientSyncDynamicError(clientDynamic)

  if (hasOutletRegex.test(componentStack)) {
    // We don't need to track that this is dynamic. It is only so when something else is also dynamic.
    return
  }
  // Resolve the config stack for this specific error. If the error
  // is inside a slot marker, use that slot's config. Otherwise fall
  // back to the default.
  const effectiveCreateInstantStack = resolveInstantStack(
    componentStack,
    dynamicValidation
  )

  if (hasMetadataRegex.test(componentStack)) {
    const error = addErrorContext(
      kind === DynamicHoleKind.Runtime
        ? createRuntimeMetadataError(workStore.route)
        : createDynamicMetadataError(workStore.route),
      componentStack,
      effectiveCreateInstantStack
    )
    dynamicValidation.dynamicMetadata = error
    return
  }
  if (hasViewportRegex.test(componentStack)) {
    const error = addErrorContext(
      kind === DynamicHoleKind.Runtime
        ? createRuntimeViewportError(workStore.route)
        : createDynamicViewportError(workStore.route),
      componentStack,
      effectiveCreateInstantStack
    )
    dynamicValidation.dynamicErrors.push(error)
    return
  }

  const boundaryLocation =
    hasInstantValidationBoundaryRegex.exec(componentStack)
  if (!boundaryLocation) {
    // We don't see the validation boundary in the component stack,
    // so this hole must be coming from a shared parent.
    // Shared parents are fully resolved and don't have RSC holes,
    // but they can still suspend in a client component during SSR.

    // If we managed to render all the validation boundaries, that means
    // that the client holes aren't blocking validation and we can disregard them.
    // Note that we don't even care whether they have suspense or not.
    if (allRequiredBoundariesRendered(boundaryState)) {
      dynamicValidation.hasAllowedClientDynamicAboveBoundary = true
      dynamicValidation.hasAllowedDynamic = true // Holes outside the boundary contribute to allowing dynamic metadata
      return
    } else {
      // TODO(instant-validation) TODO(NAR-787)
      // If shared parents blocked us from validating, we should only log
      // the errors from the innermost (segments), i.e. omit layouts whose
      // slots managed to render (because clearly they didn't block validation)
      const message = `Route "${workStore.route}": Could not validate \`unstable_instant\` because a Client Component in a parent segment prevented the page from rendering.`
      const error = addErrorContext(
        new Error(message),
        componentStack,
        effectiveCreateInstantStack
      )
      dynamicValidation.validationPreventingErrors.push(error)
      return
    }
  } else {
    // The hole originates inside the validation boundary.
    //
    // Check if we have a Suspense above the hole, but below the validation boundary.
    // If we do, then this dynamic usage wouldn't block a navigation to this subtree.
    // Conversely, if the nearest suspense is above the validation boundary, then this subtree would block.
    //
    // Note that in the component stack, children come before parents.
    //
    // Valid:
    //   ...
    //   at Suspense
    //   ...
    //   at __next_prefetch_validation_boundary__
    //
    // Invalid:
    //   ...
    //   at __next_prefetch_validation_boundary__
    //   ...
    //   at Suspense
    //
    const suspenseLocation = hasSuspenseRegex.exec(componentStack)
    if (suspenseLocation) {
      if (suspenseLocation.index < boundaryLocation.index) {
        dynamicValidation.hasAllowedDynamic = true
        return
      } else {
        // invalid - fallthrough
      }
    }
  }

  if (syncDynamicError) {
    if (
      effectiveCreateInstantStack !== null &&
      syncDynamicError.cause === undefined
    ) {
      syncDynamicError.cause = effectiveCreateInstantStack()
    }
    dynamicValidation.dynamicErrors.push(syncDynamicError)
    return
  }

  const error = addErrorContext(
    kind === DynamicHoleKind.Runtime
      ? createRuntimeBodyErrorInNavigation(workStore.route)
      : createDynamicBodyErrorInNavigation(workStore.route),
    componentStack,
    effectiveCreateInstantStack
  )
  dynamicValidation.dynamicErrors.push(error)
  return
}

export function trackThrownErrorInNavigation(
  workStore: WorkStore,
  dynamicValidation: InstantValidationState,
  thrownValue: unknown,
  componentStack: string
) {
  const boundaryLocation =
    hasInstantValidationBoundaryRegex.exec(componentStack)
  if (!boundaryLocation) {
    // There's no validation boundary on the component stack.
    // This error may have blocked a boundary from rendering.

    // Wrap the error to provide component context.
    // This helps for errors from node_modules which would otherwise
    // have no useful stack information due to ignore-listing,
    // e.g. next/dynamic with `ssr: false`.
    const error = addErrorContext(
      new Error(
        'An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.',
        { cause: thrownValue }
      ),
      componentStack,
      null
    )
    dynamicValidation.thrownErrorsOutsideBoundary.push(error)
  } else {
    // There's validation boundary on the component stack,
    // so we know this error didn't block a validation boundary from rendering.
    // However, this error might be hiding be hiding dynamic content that would
    // cause validation to fail.
    const suspenseLocation = hasSuspenseRegex.exec(componentStack)
    if (suspenseLocation) {
      if (suspenseLocation.index < boundaryLocation.index) {
        // There's a Suspense below the validation boundary but above this error's location.
        // This subtree can't fail instant validation because any potential
        // dynamic holes would be guarded by the Suspense anyway,
        // so we can allow this.
        return
      } else {
        // invalid - fallthrough
      }
    }
    const message = `Route "${workStore.route}": Could not validate \`unstable_instant\` because an error prevented the target segment from rendering.`
    const error = addErrorContext(
      new Error(message, { cause: thrownValue }),
      componentStack,
      null // TODO(instant-validation-build): conflicting use of cause
    )
    dynamicValidation.validationPreventingErrors.push(error)
  }
}

export function trackDynamicHoleInRuntimeShell(
  workStore: WorkStore,
  componentStack: string,
  dynamicValidation: DynamicValidationState,
  clientDynamic: DynamicTrackingState
) {
  const syncDynamicError = getPendingClientSyncDynamicError(clientDynamic)

  if (hasOutletRegex.test(componentStack)) {
    trackOutletSuspenseAboveBody(componentStack, dynamicValidation)
    return
  } else if (hasMetadataRegex.test(componentStack)) {
    const error = addErrorContext(
      createDynamicMetadataError(workStore.route),
      componentStack,
      null
    )
    dynamicValidation.dynamicMetadata = error
    return
  } else if (hasViewportRegex.test(componentStack)) {
    const error = addErrorContext(
      createDynamicViewportError(workStore.route),
      componentStack,
      null
    )
    dynamicValidation.dynamicErrors.push(error)
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
  } else if (syncDynamicError) {
    dynamicValidation.dynamicErrors.push(syncDynamicError)
    return
  }

  const error = addErrorContext(
    createDynamicBodyError(workStore.route),
    componentStack,
    null
  )
  dynamicValidation.dynamicErrors.push(error)
  return
}

export function trackDynamicHoleInStaticShell(
  workStore: WorkStore,
  componentStack: string,
  dynamicValidation: DynamicValidationState,
  clientDynamic: DynamicTrackingState
) {
  const syncDynamicError = getPendingClientSyncDynamicError(clientDynamic)

  if (hasOutletRegex.test(componentStack)) {
    trackOutletSuspenseAboveBody(componentStack, dynamicValidation)
    return
  } else if (hasMetadataRegex.test(componentStack)) {
    const error = addErrorContext(
      createRuntimeMetadataError(workStore.route),
      componentStack,
      null
    )
    dynamicValidation.dynamicMetadata = error
    return
  } else if (hasViewportRegex.test(componentStack)) {
    const error = addErrorContext(
      createRuntimeViewportError(workStore.route),
      componentStack,
      null
    )
    dynamicValidation.dynamicErrors.push(error)
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
  } else if (syncDynamicError) {
    dynamicValidation.dynamicErrors.push(syncDynamicError)
    return
  } else {
    const error = addErrorContext(
      createRuntimeBodyError(workStore.route),
      componentStack,
      null
    )
    dynamicValidation.dynamicErrors.push(error)
    return
  }
}

/**
 * In dev mode, we prefer using the owner stack, otherwise the provided
 * component stack is used.
 *
 * Accepts an already-created Error so the SWC error-code plugin can see the
 * `new Error(...)` call at each call site and auto-assign error codes.
 */
function addErrorContext(
  error: Error,
  componentStack: string,
  createInstantStack: (() => Error) | null
) {
  const ownerStack =
    process.env.NODE_ENV !== 'production' && React.captureOwnerStack
      ? React.captureOwnerStack()
      : null

  if (createInstantStack !== null) {
    error.cause = createInstantStack()
  }
  // TODO go back to owner stack here if available. This is temporarily using componentStack to get the right
  //
  error.stack =
    error.name + ': ' + error.message + (ownerStack || componentStack)
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
  logBuildDebugHint(workStore.route)
}

export function throwIfSyncIOUsed(
  workStore: WorkStore,
  serverDynamic: DynamicTrackingState
) {
  if (serverDynamic.syncDynamicErrorWithStack) {
    logDisallowedDynamicError(
      workStore,
      serverDynamic.syncDynamicErrorWithStack
    )
    throw new StaticGenBailoutError()
  }
}

export function throwIfDisallowedDynamic(
  workStore: WorkStore,
  prelude: PreludeState,
  dynamicValidation: DynamicValidationState,
  serverDynamic: DynamicTrackingState,
  allowEmptyStaticShell: boolean
): void {
  throwIfSyncIOUsed(workStore, serverDynamic)

  // The dynamic metadata error is a mistake-detection signal. It fires when the
  // rest of the shell is otherwise fully static apart from metadata, suggesting
  // the dynamic data access in `generateMetadata` was probably unintentional.
  // That condition is independent of whether the user or build phase accepted
  // an empty shell, so we surface it before any opt-in bypass.
  if (
    prelude === PreludeState.Full &&
    dynamicValidation.hasAllowedDynamic === false &&
    dynamicValidation.hasDynamicMetadata
  ) {
    console.error(createDynamicOrRuntimeMetadataError(workStore.route).message)
    throw new StaticGenBailoutError()
  }

  // Either flag expresses "this shell is allowed to be empty/blocking":
  //   - `allowEmptyStaticShell` covers `unstable_instant = false` (user opt-in)
  //     and the build-phase fallback-shell case.
  //   - `hasSuspenseAboveBody` is the structural opt-in inside the user's root
  //     layout.
  // Treat them as synonyms for the purpose of bypassing shell-failure errors.
  if (allowEmptyStaticShell || dynamicValidation.hasSuspenseAboveBody) {
    return
  }

  if (prelude !== PreludeState.Full) {
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
        createDynamicOrRuntimeViewportError(workStore.route).message
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
  }
}

export function getStaticShellDisallowedDynamicReasons(
  workStore: WorkStore,
  prelude: PreludeState,
  dynamicValidation: DynamicValidationState,
  allowEmptyStaticShell: boolean
): Array<Error> {
  // The dynamic metadata error is a mistake-detection signal. It fires when the
  // rest of the shell is otherwise fully static apart from metadata, suggesting
  // the dynamic data access in `generateMetadata` was probably unintentional.
  // That condition is independent of whether the user or build phase accepted
  // an empty shell, so we surface it before any opt-in bypass.
  if (
    prelude === PreludeState.Full &&
    dynamicValidation.hasAllowedDynamic === false &&
    dynamicValidation.dynamicErrors.length === 0 &&
    dynamicValidation.dynamicMetadata
  ) {
    return [dynamicValidation.dynamicMetadata]
  }

  // Either flag expresses "this shell is allowed to be empty/blocking":
  //   - `allowEmptyStaticShell` covers `unstable_instant = false` (user opt-in)
  //     and the build-phase fallback-shell case.
  //   - `hasSuspenseAboveBody` is the structural opt-in inside the user's root
  //     layout.
  // Treat them as synonyms for the purpose of bypassing shell-failure errors.
  if (allowEmptyStaticShell || dynamicValidation.hasSuspenseAboveBody) {
    return []
  }

  if (prelude !== PreludeState.Full) {
    // We didn't have any sync bailouts but there may be user code which
    // blocked the root. We would have captured these during the prerender
    // and can log them here and then terminate the build/validating render
    const dynamicErrors = dynamicValidation.dynamicErrors
    if (dynamicErrors.length > 0) {
      return dynamicErrors
    }

    if (prelude === PreludeState.Empty) {
      // If we ever get this far then we messed up the tracking of invalid dynamic.
      // We still adhere to the constraint that you must produce a shell but invite the
      // user to report this as a bug in Next.js.
      return [
        new InvariantError(
          `Route "${workStore.route}" did not produce a static shell and Next.js was unable to determine a reason.`
        ),
      ]
    }
  }
  // We had a non-empty prelude and there are no dynamic holes
  return []
}

/**
 * `errors` are validation failures that should be surfaced immediately.
 * `deferredFallback` carries a missing-boundary explanation that the caller
 * should hold back until *every* validation depth has been tried — a missing
 * boundary often just means a parent layout intentionally omitted a slot, and
 * a different depth's validation may surface a more meaningful error.
 */
export type NavigationValidationResult =
  // instances that block instant navigation
  | Array<Error>
  // validation was blocked with zero or more reasons
  | Error
  | AggregateError

export function getNavigationDisallowedDynamicReasons(
  workStore: WorkStore,
  prelude: PreludeState,
  dynamicValidation: InstantValidationState,
  validationSampleTracking: InstantValidationSampleTracking | null,
  boundaryState: ValidationBoundaryTracking,
  devRenderDidError: boolean
): NavigationValidationResult {
  // If we have errors related to missing samples, those should take precedence over everything else.
  if (validationSampleTracking) {
    const { missingSampleErrors } = validationSampleTracking
    if (missingSampleErrors.length > 0) {
      return missingSampleErrors
    }
  }

  const { validationPreventingErrors } = dynamicValidation
  if (validationPreventingErrors.length > 0) {
    if (process.env.__NEXT_DEV_SERVER && devRenderDidError) {
      // The dev render already surfaced server errors to the user.
      // The same errors likely caused validation to be inconclusive,
      // so reporting them again as validation failures would be noisy.
      return []
    }
    return validationPreventingErrors
  }

  // NOTE: We don't care about Suspense above body here,
  // we're only concerned with the validation boundary
  if (prelude !== PreludeState.Full) {
    const dynamicErrors = dynamicValidation.dynamicErrors
    if (dynamicErrors.length > 0) {
      return dynamicErrors
    }

    if (
      prelude === PreludeState.Empty &&
      !dynamicValidation.hasAllowedClientDynamicAboveBoundary &&
      allRequiredBoundariesRendered(boundaryState)
    ) {
      // If we ever get this far then we messed up the tracking of invalid
      // dynamic. (When boundaries are missing the deferred fallback below
      // will surface a more useful error.)
      return new InvariantError(
        `Route "${workStore.route}" failed to render during instant validation and Next.js was unable to determine a reason.`
      )
    }
  } else {
    const dynamicErrors = dynamicValidation.dynamicErrors
    if (dynamicErrors.length > 0) {
      return dynamicErrors
    }

    if (
      dynamicValidation.hasAllowedDynamic === false &&
      dynamicValidation.dynamicMetadata
    ) {
      return [dynamicValidation.dynamicMetadata]
    }
  }

  // Missing boundaries on their own aren't a strong signal — a parent
  // layout may legitimately omit a slot. Defer this so the caller can
  // try shallower validation depths first; if every depth comes up
  // empty we still want to surface this so the user is made aware that
  // validation didn't complete. When we add a markers API, the
  // marker-based variant of this check can become strict again.
  if (!allRequiredBoundariesRendered(boundaryState)) {
    const { thrownErrorsOutsideBoundary } = dynamicValidation
    const rootInstantStack = dynamicValidation.slotStacks[0]
    if (thrownErrorsOutsideBoundary.length === 0) {
      const missingFiles: string[] = []
      for (const [id, filePaths] of boundaryState.requiredIds) {
        if (!boundaryState.renderedIds.has(id)) {
          for (const filePath of filePaths) {
            let normalized = filePath
              .replace(/^\[project\][\\/]?/, '')
              .replace(process.cwd() + '/', '')
              .replace(process.cwd() + '\\', '')
            missingFiles.push(normalized)
          }
        }
      }
      missingFiles.sort()
      let message = `Route "${workStore.route}": Could not validate that a segment in your UI has instant navigation.`
      if (missingFiles.length > 0) {
        const label =
          missingFiles.length === 1 ? 'Dropped segment' : 'Dropped segments'
        message +=
          `\n\nThis segment was dropped from rendering. Issues that would prevent instant navigation will go undetected.` +
          `\n\n${label}:\n${missingFiles.map((p) => `  ${p}`).join('\n')}` +
          `\n\nWays to fix this:` +
          `\n  - [render] Render the dropped segment` +
          `\n    https://nextjs.org/docs/messages/instant-unrendered-segment#render-the-dropped-segment` +
          `\n  - [ignore] Set \`export const unstable_instant = false\` on the dropped segment to skip validation` +
          `\n    https://nextjs.org/docs/messages/instant-unrendered-segment#skip-validation-on-the-segment`
      }
      const error = new Error(message)
      return error
    } else if (process.env.__NEXT_DEV_SERVER && devRenderDidError) {
      // Errors outside the boundary likely blocked it from rendering,
      // but they're already being reported to the user via the dev
      // render. Suppress the validation failure to avoid noise.
      return []
    } else if (thrownErrorsOutsideBoundary.length === 1) {
      const message = `Route "${workStore.route}": Could not validate \`unstable_instant\` because the target segment was prevented from rendering, likely due to the following error.`
      const error = rootInstantStack !== null ? rootInstantStack() : new Error()
      error.name = 'Error'
      error.message = message
      return new AggregateError([
        error,
        thrownErrorsOutsideBoundary[0] as Error,
      ])
    } else {
      const message = `Route "${workStore.route}": Could not validate \`unstable_instant\` because the target segment was prevented from rendering, likely due to one of the following errors.`
      const error = rootInstantStack !== null ? rootInstantStack() : new Error()
      error.name = 'Error'
      error.message = message
      return new AggregateError([
        error,
        ...(thrownErrorsOutsideBoundary as Error[]),
      ])
    }
  }

  // We had a non-empty prelude and there are no dynamic holes
  return []
}
