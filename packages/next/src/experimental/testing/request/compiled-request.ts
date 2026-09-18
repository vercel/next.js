import type { IncomingHttpHeaders } from 'http'
import type { CompiledTestRequestContext } from '../contracts'
import type { IncrementalCache } from '../../../server/lib/incremental-cache'
import type { Params } from '../../../server/request/params'
import {
  createRequestStore,
  type RequestStoreInputs,
} from '../../../server/async-storage/request-store'
import { getPreviouslyRevalidatedTags } from '../../../server/server-utils'
import { getImplicitTags } from '../../../server/lib/implicit-tags'
import {
  RequestLifecycleError,
  type RequestLifecycle,
} from './request-lifecycle'
import { executeRevalidates } from '../../../server/revalidation-utils'
import { workAsyncStorage } from '../../../server/app-render/work-async-storage.external'
import { createCompiledRequestWorkContext } from './compiled-context'

/** Inputs for the explicitly dynamic, route-less dynamic subtree profile. */
export interface CompiledRequestOptions {
  page: string
  url: URL
  headers: IncomingHttpHeaders
  rootParams: Params
  incrementalCache: IncrementalCache
  lifecycle: RequestLifecycle
}

/**
 * Create fresh request inputs while retaining the caller's explicit file cache
 * lifetime. Cache instances must be request-specific, as in NextServer, even
 * when their backing memory and disk caches are shared within a file.
 */
export async function createCompiledRequestResources(
  metadata: CompiledTestRequestContext | undefined,
  options: CompiledRequestOptions
) {
  // Check the capability before constructing stores or evaluating lazy tags.
  const workContext = createCompiledRequestWorkContext(metadata, {
    page: options.page,
    previouslyRevalidatedTags: getPreviouslyRevalidatedTags(
      options.headers,
      options.incrementalCache?.previewProps?.previewModeId
    ),
    renderOpts: {
      incrementalCache: options.incrementalCache,
      isOnDemandRevalidate: options.incrementalCache?.isOnDemandRevalidate,
      isBuildTimePrerendering: false,
      isDraftMode: false,
      experimental: {},
      ...options.lifecycle.renderOpts,
    },
  })
  const inputs: Omit<RequestStoreInputs, 'phase'> = {
    headers: options.headers,
    url: { pathname: options.url.pathname, search: options.url.search },
    rootParams: options.rootParams,
    implicitTags: await getImplicitTags(
      options.page,
      options.url.pathname,
      null
    ),
    previewProps: options.incrementalCache.previewProps,
    onUpdateCookies: undefined,
    resumeDataCache: null,
    fallbackParams: null,
    isHmrRefresh: false,
    serverComponentsHmrCache: undefined,
    hmrRefreshHash: undefined,
  }
  // Use the production draft-mode logic (including revalidation headers), not
  // a flag inferred from a cookie's presence.
  workContext.renderOpts.isDraftMode = createRequestStore({
    ...inputs,
    phase: 'render',
  }).draftMode.isEnabled

  let closing: Promise<void> | undefined
  function close(): Promise<void> {
    return (closing ??= Promise.resolve().then(async () => {
      const errors: unknown[] = []
      const store = workContext.renderOpts.store
      if (store) {
        // executeRevalidates starts actual tag invalidation and gathers cache
        // work. It uses Promise.all, so also settle the original writes before
        // ending the request if another revalidation rejects early.
        const results = await Promise.allSettled([
          Promise.resolve().then(async () => {
            await workAsyncStorage.run(store, () => executeRevalidates(store))
          }),
          ...Object.values(store.pendingRevalidates ?? {}),
          ...(store.pendingRevalidateWrites ?? []),
        ])
        for (const result of results) {
          if (result.status === 'rejected') errors.push(result.reason)
        }
      }
      // after() work must still run and drain if cache work failed.
      try {
        await options.lifecycle.close()
      } catch (error) {
        if (error instanceof RequestLifecycleError) errors.push(...error.errors)
        else errors.push(error)
      }
      // AfterContext executes revalidations added by after() callbacks, but
      // its Promise.all can reject while sibling writes are still pending.
      // Settle the actual registered promises without re-running tag updates.
      // A write may register further work, so re-read after each settled batch.
      const settled = new Set<Promise<unknown>>()
      while (store) {
        const pending = [
          ...Object.values(store.pendingRevalidates ?? {}),
          ...(store.pendingRevalidateWrites ?? []),
        ].filter((promise) => !settled.has(promise))
        if (pending.length === 0) break
        for (const promise of pending) settled.add(promise)
        for (const result of await Promise.allSettled(pending)) {
          if (result.status === 'rejected') errors.push(result.reason)
        }
      }
      if (errors.length > 0) {
        throw new RequestLifecycleError([...new Set(errors)])
      }
    }))
  }

  return { inputs, workContext, close }
}
