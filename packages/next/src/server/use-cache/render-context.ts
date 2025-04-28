import {
  postponeWithTracking,
  throwToInterruptStaticGeneration,
} from '../app-render/dynamic-rendering'
import type { WorkStore } from '../app-render/work-async-storage.external'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'
import {
  makeUntrackedExoticCookies,
  makeDynamicallyTrackedExoticCookies,
  makeUntrackedExoticCookiesWithDevWarnings,
} from '../request/cookies'
import type { ReadonlyRequestCookies } from '../web/spec-extension/adapters/request-cookies'

export interface UseCacheRenderContextPrerender {
  readonly type: 'prerender'
  readonly getUserspaceCookies: () => Promise<ReadonlyRequestCookies>
  readonly renderSignal: AbortSignal
  readonly dynamicAccessAbortController: AbortController
}

export interface UseCacheRenderContextPrerenderPPR {
  readonly type: 'prerender-ppr'
  readonly getUserspaceCookies: () => Promise<ReadonlyRequestCookies>
}

export interface UseCacheRenderContextPrerenderLegacy {
  readonly type: 'prerender-legacy'
  readonly getUserspaceCookies: () => Promise<ReadonlyRequestCookies>
}

export interface UseCacheRenderContextRequest {
  readonly type: 'request'
  readonly underlyingCookies: ReadonlyRequestCookies
  readonly getUserspaceCookies: () => Promise<ReadonlyRequestCookies>
  accessedCookieNames: Set<string> | 'all'
}

export type UseCacheRenderContext =
  | UseCacheRenderContextPrerender
  | UseCacheRenderContextPrerenderPPR
  | UseCacheRenderContextPrerenderLegacy
  | UseCacheRenderContextRequest

export function createUseCacheRenderContext(
  workStore: WorkStore,
  workUnitStore: WorkUnitStore
): UseCacheRenderContext | undefined {
  if (workUnitStore.type === 'prerender') {
    // If there are cookies defined on a prerender store, this means we're doing
    // a dev warmup render, which is more akin to a dynamic request than a
    // prerender request, despite using a prerender work unit store.
    if (workUnitStore.cookies) {
      const userspaceCookies = makeUntrackedExoticCookies(workUnitStore.cookies)

      return {
        type: 'request',
        underlyingCookies: workUnitStore.cookies,
        getUserspaceCookies: () => userspaceCookies,
        accessedCookieNames: new Set(),
      }
    }

    const userspaceCookies = makeDynamicallyTrackedExoticCookies(
      workStore.route,
      workUnitStore
    )

    return {
      type: 'prerender',
      getUserspaceCookies: () => userspaceCookies,
      renderSignal: workUnitStore.renderSignal,
      dynamicAccessAbortController: new AbortController(),
    }
  }

  switch (workUnitStore.type) {
    case 'prerender-ppr':
      return {
        type: 'prerender-ppr',
        getUserspaceCookies: () =>
          postponeWithTracking(
            workStore.route,
            'cookies',
            workUnitStore.dynamicTracking
          ),
      }
    case 'prerender-legacy':
      return {
        type: 'prerender-legacy',
        getUserspaceCookies: () =>
          throwToInterruptStaticGeneration('cookies', workStore, workUnitStore),
      }
    // case 'cache-with-cookies':
    //   return workUnitStore.cookies
    case 'cache':
      switch (workUnitStore.renderContext?.type) {
        case 'request':
          return {
            ...workUnitStore.renderContext,
            // Each cache scope starts with a new set of accessed cookie names.
            accessedCookieNames: new Set(),
          }
        case 'prerender':
          return {
            ...workUnitStore.renderContext,
            // Each cache scope gets its own abort controller.
            dynamicAccessAbortController: new AbortController(),
          }
        default:
          return workUnitStore.renderContext
      }
    case 'request':
      const userspaceCookies =
        process.env.NODE_ENV === 'development' && !workStore.isPrefetchRequest
          ? makeUntrackedExoticCookiesWithDevWarnings(
              workUnitStore.cookies,
              workStore.route
            )
          : makeUntrackedExoticCookies(workUnitStore.cookies)

      return {
        type: 'request',
        underlyingCookies: workUnitStore.cookies,
        getUserspaceCookies: () => userspaceCookies,
        accessedCookieNames: new Set(),
      }
    default:
      return undefined
  }
}
