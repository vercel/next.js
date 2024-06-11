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

// Once postpone is in stable we should switch to importing the postpone export directly
import React from 'react'

import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'
import { DynamicServerError } from '../../client/components/hooks-server-context'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'

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
export type PrerenderState = {
  /**
   * When true, stack information will also be tracked during dynamic access.
   */
  readonly isDebugDynamicAccesses: boolean | undefined

  /**
   * The dynamic accesses that occurred during the render.
   */
  readonly dynamicAccesses: DynamicAccess[]
}

export function createPrerenderState(
  isDebugDynamicAccesses: boolean | undefined
): PrerenderState {
  return {
    isDebugDynamicAccesses,
    dynamicAccesses: [],
  }
}

/**
 * This function communicates that the current scope should be treated as dynamic.
 *
 * In most cases this function is a no-op but if called during
 * a PPR prerender it will postpone the current sub-tree.
 */
export function markCurrentScopeAsDynamic(
  store: StaticGenerationStore,
  expression: string
): void {
  // inside cache scopes marking a scope as dynamic has no effect because the outer cache scope
  // creates a cache boundary. This is subtly different from reading a dynamic data source which is
  // forbidden inside a cache scope.
  if (store.isUnstableCacheCallback) return

  // If we're forcing dynamic rendering or we're forcing static rendering, we
  // don't need to do anything here because the entire page is already dynamic
  // or it's static and it should not throw or postpone here.
  if (store.forceDynamic || store.forceStatic) return

  if (store.dynamicShouldError) {
    throw new StaticGenBailoutError(
      `Route ${store.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
    )
  }

  if (
    // We are in a prerender (PPR enabled, during build)
    store.prerenderState
  ) {
    // We track that we had a dynamic scope that postponed.
    // This will be used by the renderer to decide whether
    // the prerender requires a resume
    postponeWithTracking(store.prerenderState, expression, store.route)
  }

  store.revalidate = 0

  if (store.isStaticGeneration) {
    // We aren't prerendering but we are generating a static page. We need to bail out of static generation
    const err = new DynamicServerError(
      `Route ${store.route} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`
    )
    store.dynamicUsageDescription = expression
    store.dynamicUsageStack = err.stack

    throw err
  }
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
  store: StaticGenerationStore,
  expression: string
): void {
  if (store.isUnstableCacheCallback) {
    throw new Error(
      `Route ${store.route} used "${expression}" inside a function cached with "unstable_cache(...)". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "${expression}" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
    )
  } else if (store.dynamicShouldError) {
    throw new StaticGenBailoutError(
      `Route ${store.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
    )
  } else if (
    // We are in a prerender (PPR enabled, during build)
    store.prerenderState
  ) {
    // We track that we had a dynamic scope that postponed.
    // This will be used by the renderer to decide whether
    // the prerender requires a resume
    postponeWithTracking(store.prerenderState, expression, store.route)
  } else {
    store.revalidate = 0

    if (store.isStaticGeneration) {
      // We aren't prerendering but we are generating a static page. We need to bail out of static generation
      const err = new DynamicServerError(
        `Route ${store.route} couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`
      )
      store.dynamicUsageDescription = expression
      store.dynamicUsageStack = err.stack

      throw err
    }
  }
}

/**
 * This component will call `React.postpone` that throws the postponed error.
 */
type PostponeProps = {
  reason: string
  prerenderState: PrerenderState
  route: string
}
export function Postpone({
  reason,
  prerenderState,
  route,
}: PostponeProps): never {
  postponeWithTracking(prerenderState, reason, route)
}

function postponeWithTracking(
  prerenderState: PrerenderState,
  expression: string,
  route: string
): never {
  assertPostpone()
  const reason =
    `Route ${route} needs to bail out of prerendering at this point because it used ${expression}. ` +
    `React throws this special object to indicate where. It should not be caught by ` +
    `your own try/catch. Learn more: https://nextjs.org/docs/messages/ppr-caught-error`

  prerenderState.dynamicAccesses.push({
    // When we aren't debugging, we don't need to create another error for the
    // stack trace.
    stack: prerenderState.isDebugDynamicAccesses
      ? new Error().stack
      : undefined,
    expression,
  })

  React.unstable_postpone(reason)
}

export function usedDynamicAPIs(prerenderState: PrerenderState): boolean {
  return prerenderState.dynamicAccesses.length > 0
}

export function formatDynamicAPIAccesses(
  prerenderState: PrerenderState
): string[] {
  return prerenderState.dynamicAccesses
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
