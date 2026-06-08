import { getLayoutOrPageModule } from '../../lib/app-dir-module'
import type { LoaderTree } from '../../lib/app-dir-module'
import { parseLoaderTree } from '../../../shared/lib/router/utils/parse-loader-tree'
import {
  PAGE_SEGMENT_KEY,
  DEFAULT_SEGMENT_KEY,
} from '../../../shared/lib/segment'
import {
  UNDERSCORE_GLOBAL_ERROR_ROUTE,
  UNDERSCORE_NOT_FOUND_ROUTE,
} from '../../../shared/lib/entry-constants'
import type { Segment } from '../../../shared/lib/app-router-types'
import type {
  AppSegmentConfig,
  InstantSample,
} from '../../../build/segment-config/app/app-segment-config'
import {
  workAsyncStorage,
  type WorkStore,
} from '../work-async-storage.external'
import { InvariantError } from '../../../shared/lib/invariant-error'

/**
 * True when an unconfigured segment should be treated as implicitly
 * validated under a non-manual default validation level. Only page and
 * default segments qualify — layouts do not validate on their own.
 */
export function isImplicitValidationSegment(segment: Segment): boolean {
  const key = typeof segment === 'string' ? segment : segment[0]
  return (
    key === PAGE_SEGMENT_KEY ||
    key.startsWith(PAGE_SEGMENT_KEY) ||
    key === DEFAULT_SEGMENT_KEY
  )
}

/**
 * Routes for the framework-synthesized error and not-found entries. They
 * have no user-configurable escape hatch (the framework supplies the page
 * when the user hasn't), so they're excluded from implicit validation under
 * a non-manual default validation level. Even when the user provides their
 * own `global-error` or root `not-found`, these pages are special-purpose
 * error UI — opting them into validation is something the user can do
 * explicitly via `unstable_instant`.
 */
export function isFrameworkErrorRoute(route: string | undefined): boolean {
  return (
    route === UNDERSCORE_GLOBAL_ERROR_ROUTE ||
    route === UNDERSCORE_NOT_FOUND_ROUTE
  )
}

export async function anySegmentHasRuntimePrefetchEnabled(
  tree: LoaderTree
): Promise<boolean> {
  const { mod: layoutOrPageMod } = await getLayoutOrPageModule(tree)

  // TODO(restart-on-cache-miss): Does this work correctly for client page/layout modules?
  const prefetchConfig = layoutOrPageMod
    ? (layoutOrPageMod as AppSegmentConfig).prefetch
    : undefined
  if (prefetchConfig === 'allow-runtime') {
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
    if (instantConfig === false) {
      return true
    } else {
      return false
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

enum VALIDATION_LEVEL {
  WARNING = 0,
  ERROR = 1,
}

/**
 * Walks the loader tree and checks if any segment has an `instant` config
 * that needs validating for the given mode.
 *
 * - Explicit `unstable_instant` exports are checked against mode.
 * - Page and default segments without an explicit config get implicit
 *   validation when the default validation level applies to this mode.
 * - `unstable_disableValidation` on any segment kills validation for
 *   the whole tree.
 */
async function anySegmentNeedsInstantValidation(
  rootTree: LoaderTree,
  level: VALIDATION_LEVEL
): Promise<boolean> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError(
      'anySegmentNeedsInstantValidation must run inside a WorkStore'
    )
  }
  const { validationLevel } = workStore

  let baseValidationLevel: number = VALIDATION_LEVEL.WARNING
  let manualValidation: boolean = false
  switch (validationLevel) {
    case 'manual-warning':
      manualValidation = true
    // intentional fallthrough
    case 'warning':
      baseValidationLevel = VALIDATION_LEVEL.WARNING
      break
    case 'experimental-manual-error':
      manualValidation = true
    // intentional fallthrough
    case 'experimental-error':
      baseValidationLevel = VALIDATION_LEVEL.ERROR
      break
    default:
      validationLevel satisfies never
  }

  const applyDefaultValidation =
    // We need to be validating the right level
    level <= baseValidationLevel &&
    // We need to not be in manual validation mode
    !manualValidation &&
    // We don't validate framework internal routes by default
    !isFrameworkErrorRoute(workStore.route)

  let needsValidation = false
  let disabled = false

  async function visit(tree: LoaderTree): Promise<void> {
    if (disabled) return

    const { mod: layoutOrPageMod } = await getLayoutOrPageModule(tree)
    const instantConfig = layoutOrPageMod
      ? (layoutOrPageMod as AppSegmentConfig).unstable_instant
      : undefined

    if (instantConfig === false) {
      // Explicit opt-out. Doesn't itself trigger validation.
    } else if (instantConfig === true) {
      // Explicit opt-in using the default level.
      if (level <= baseValidationLevel) {
        needsValidation = true
      }
    } else if (typeof instantConfig === 'object' && instantConfig !== null) {
      if (
        instantConfig.unstable_disableValidation === true ||
        (level === VALIDATION_LEVEL.WARNING &&
          instantConfig.unstable_disableDevValidation === true) ||
        (level === VALIDATION_LEVEL.ERROR &&
          instantConfig.unstable_disableBuildValidation === true)
      ) {
        disabled = true
        return
      }

      if (instantConfig.level !== undefined) {
        const configuredLevel =
          instantConfig.level === 'experimental-error'
            ? VALIDATION_LEVEL.ERROR
            : VALIDATION_LEVEL.WARNING
        if (level <= configuredLevel) {
          needsValidation = true
        }
      } else if (level <= baseValidationLevel) {
        needsValidation = true
      }
    } else if (applyDefaultValidation && isImplicitValidationSegment(tree[0])) {
      // No explicit config. Implicit validation applies to page/default
      // segments when the default level is active for this mode.
      needsValidation = true
    }

    const { parallelRoutes } = parseLoaderTree(tree)
    for (const parallelRouteKey in parallelRoutes) {
      await visit(parallelRoutes[parallelRouteKey])
      if (disabled) return
    }
  }

  await visit(rootTree)
  if (disabled) {
    return false
  }
  return needsValidation
}

export const anySegmentNeedsInstantValidationInDev = cacheScopedToWorkStore(
  async (rootTree: LoaderTree): Promise<boolean> =>
    anySegmentNeedsInstantValidation(rootTree, VALIDATION_LEVEL.WARNING)
)

export const anySegmentNeedsInstantValidationInBuild = cacheScopedToWorkStore(
  async (rootTree: LoaderTree): Promise<boolean> =>
    anySegmentNeedsInstantValidation(rootTree, VALIDATION_LEVEL.ERROR)
)

export const resolveInstantConfigSamplesForPage = async (
  tree: LoaderTree
): Promise<InstantSample[] | null> => {
  const { mod: layoutOrPageMod } = await getLayoutOrPageModule(tree)

  const instantConfig = layoutOrPageMod
    ? (layoutOrPageMod as AppSegmentConfig).unstable_instant
    : undefined

  let samples: InstantSample[] | null = null
  if (
    instantConfig !== undefined &&
    typeof instantConfig === 'object' &&
    instantConfig.unstable_samples
  ) {
    samples = instantConfig.unstable_samples
  }

  // The samples from inner segments override samples from outer segments,
  // i.e. a page overrides the samples from a layout.
  // We do not perform any merging logic.
  const { parallelRoutes } = parseLoaderTree(tree)
  for (const parallelRouteKey in parallelRoutes) {
    if (parallelRouteKey !== 'children') {
      // TODO(instant-validation-build): do something with with samples from non-children slots?
      continue
    }
    const childTree = parallelRoutes[parallelRouteKey]
    const childSamples = await resolveInstantConfigSamplesForPage(childTree)
    if (childSamples !== null) {
      samples = childSamples
    }
  }

  return samples
}

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
      throw new InvariantError(
        `${func.name || 'cacheScopedToWorkStore callee'} must run inside a WorkStore`
      )
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
