import { getLayoutOrPageModule } from '../../lib/app-dir-module'
import type { LoaderTree } from '../../lib/app-dir-module'
import { parseLoaderTree } from '../../../shared/lib/router/utils/parse-loader-tree'
import type { AppSegmentConfig } from '../../../build/segment-config/app/app-segment-config'
import {
  workAsyncStorage,
  type WorkStore,
} from '../work-async-storage.external'

export async function anySegmentHasRuntimePrefetchEnabled(
  tree: LoaderTree
): Promise<boolean> {
  const { mod: layoutOrPageMod } = await getLayoutOrPageModule(tree)

  // TODO(restart-on-cache-miss): Does this work correctly for client page/layout modules?
  const instantConfig = layoutOrPageMod
    ? (layoutOrPageMod as AppSegmentConfig).unstable_instant
    : undefined
  const hasRuntimePrefetch =
    instantConfig && typeof instantConfig === 'object'
      ? instantConfig.prefetch === 'runtime'
      : false
  if (hasRuntimePrefetch) {
    return true
  }

  const { parallelRoutes } = parseLoaderTree(tree)
  for (const parallelRouteKey in parallelRoutes) {
    const parallelRoute = parallelRoutes[parallelRouteKey]
    const hasChildRuntimePrefetch =
      await anySegmentHasRuntimePrefetchEnabled(parallelRoute)
    if (hasChildRuntimePrefetch) {
      return true
    }
  }

  return false
}

export async function isPageAllowedToBlock(tree: LoaderTree): Promise<boolean> {
  const { mod: layoutOrPageMod } = await getLayoutOrPageModule(tree)

  // TODO(restart-on-cache-miss): Does this work correctly for client page/layout modules?
  const instantConfig = layoutOrPageMod
    ? (layoutOrPageMod as AppSegmentConfig).unstable_instant
    : undefined

  // If we encounter a non-false instant config before a instant=false,
  // the page isn't allowed to block. The config expresses a requirement for
  // instant UI, so we should make sure that a static shell exists.
  // (even if it'd use runtime prefetching for client navs)
  if (instantConfig !== undefined) {
    if (typeof instantConfig === 'object') {
      return false
    } else if (instantConfig === false) {
      return true
    }
  }

  const { parallelRoutes } = parseLoaderTree(tree)
  for (const parallelRouteKey in parallelRoutes) {
    const parallelRoute = parallelRoutes[parallelRouteKey]
    const subtreeIsBlocking = await isPageAllowedToBlock(parallelRoute)
    if (subtreeIsBlocking) {
      return true
    }
  }

  return false
}

type FoundSegmentWithConfig = {
  path: string[]
  config: NonNullable<AppSegmentConfig['unstable_instant']>
}

/**
 * Checks if any segments in the loader tree have `instant` configs that need validating.
 * NOTE: Client navigations call this multiple times, so we cache it.
 * */
export const anySegmentNeedsInstantValidation = cacheScopedToWorkStore(
  async (rootTree: LoaderTree): Promise<boolean> => {
    const segments = await findSegmentsWithInstantConfig(rootTree)

    // Check if there's any configs with `prefetch: 'static'` or `mode: 'instant'`.
    // (If there's only `false`, there's no need to run validation).
    // If any segment has `unstable_disableValidation`, we skip validation for the whole tree.
    let needsValidation = false
    for (const { config } of segments) {
      if (typeof config === 'object') {
        if (config.unstable_disableValidation) {
          return false
        }
        // do not short-circuit, some other segment might still have `unstable_disableValidation`
        needsValidation = true
      }
    }
    return needsValidation
  }
)

export const findSegmentsWithInstantConfig = cacheScopedToWorkStore(
  async (rootTree: LoaderTree): Promise<FoundSegmentWithConfig[]> => {
    const results: FoundSegmentWithConfig[] = []

    async function visit(tree: LoaderTree, path: string[]): Promise<void> {
      const { mod: layoutOrPageMod } = await getLayoutOrPageModule(tree)

      // TODO(restart-on-cache-miss): Does this work correctly for client page/layout modules?
      const instantConfig = layoutOrPageMod
        ? (layoutOrPageMod as AppSegmentConfig).unstable_instant
        : undefined
      if (instantConfig !== undefined) {
        results.push({
          path,
          config: instantConfig,
        })
      }

      const { parallelRoutes } = parseLoaderTree(tree)
      for (const parallelRouteKey in parallelRoutes) {
        const childTree = parallelRoutes[parallelRouteKey]
        await visit(childTree, [...path, parallelRouteKey])
      }
    }

    await visit(rootTree, [])
    return results
  }
)

/**
 * A simple cache wrapper for 1-argument functions.
 * The cache will live as long as the current WorkStore,
 * i.e. it's scoped to a single request.
 */
function cacheScopedToWorkStore<TArg extends WeakKey, TRes>(
  func: (arg: TArg) => TRes
): (arg: TArg) => TRes {
  const resultsPerWorkStore = new WeakMap<WorkStore, WeakMap<TArg, TRes>>()
  return (arg: TArg): TRes => {
    const workStore = workAsyncStorage.getStore()
    if (!workStore) {
      // No caching.
      return func(arg)
    }

    let results = resultsPerWorkStore.get(workStore)
    if (results && results.has(arg)) {
      return results.get(arg)!
    }

    const result = func(arg)

    if (!results) {
      results = new WeakMap()
      resultsPerWorkStore.set(workStore, results)
    }
    results.set(arg, result)

    return result
  }
}
