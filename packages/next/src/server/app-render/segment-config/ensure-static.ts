import type {
  AppSegmentConfig,
  EnsureStatic,
} from '../../../build/segment-config/app/app-segment-config'
import { parseLoaderTree } from '../../../shared/lib/router/utils/parse-loader-tree'
import {
  getLayoutOrPageModule,
  type LoaderTree,
} from '../../lib/app-dir-module'

/**
 * The outcome of resolving a route's `ensureStatic` config.
 * The ordering is intentional -- higher values indicate a
 * more constrained route that forces more request kinds to be static.
 *
 * A constraint also implies all its predecessors:
 * - `Prefetch` implies `Shell`, i.e. if prefetches are static, so are shells.
 * - `Navigation` implies `Prefetch` and `Shell`, i.e. if the whole page is static,
 *   then so are its shells and prefetches.
 *
 * Note that this flattens `"auto"` and `false` into `None`.
 * This is because rendering code does not need to distinguish them --
 * both indicate that the route follows normal Partial Prefetching semantics
 * and does not force anything to be static.
 * However, it is only correct to collapse them into one *after* resolving the
 * config for the entire route, because they have different interactions with
 * configs from other segments on the same route.
 */
export enum EnsureStaticLevel {
  /** The route follows standard Partial Prefetching semantics. */
  None = 0,
  /** The route requires that app shells must be statically prerendered. */
  Shell = 1,
  /** The route requires that app shells and prefetches must be statically prerendered. */
  Prefetch = 2,
  /** The route requires that app shells, prefetches, and the whole page must be statically prerendered. */
  Navigation = 3,
}

function getEnsureStaticLevel(ensureStatic: EnsureStatic) {
  switch (ensureStatic) {
    case 'auto':
    case false: {
      return EnsureStaticLevel.None
    }
    case 'shell': {
      return EnsureStaticLevel.Shell
    }
    case 'prefetch': {
      return EnsureStaticLevel.Prefetch
    }
    case 'navigation': {
      return EnsureStaticLevel.Navigation
    }
  }
}

export async function resolveEnsureStaticLevel(
  tree: LoaderTree,
  partialPrefetching: boolean
): Promise<EnsureStaticLevel> {
  let { config, filePath } = await resolveEnsureStaticConfigImpl(tree)

  if (!partialPrefetching) {
    // If Partial Prefetching is not enabled for this route, we only support
    // a subset of `ensureStatic` values.
    // (We error in `getAppPageStaticInfo` if `ensureStatic` is used without enabling
    // Cache Components, so we don't have to assert that here)
    switch (config) {
      case 'auto': {
        // Default to the equivalent of Cache Components prefetching behavior.
        config = 'prefetch'
        break
      }
      case false:
      case 'shell': {
        // Not meaningful in Cache Components without Partial Prefetching
        const originalConfig = config
        config = 'prefetch'
        console.warn(
          `${formatEnsureStaticExport(originalConfig)} has no effect unless the route is using Partial Prefetching.` +
            `\n  (from: ${filePath})`
        )
        break
      }
      case 'prefetch':
        // Equivalent to regular Cache Components behavior, so we allow it
        // without warning to avoid noise when doing gradual opt-in
        break
      case 'navigation':
        // Meaningful in Cache Components, even without Partial Prefetching
        break
      default:
        config satisfies never
    }
  }

  return getEnsureStaticLevel(config)
}

type EnsureStaticWithSource = {
  config: EnsureStatic
  filePath: string | null
}

async function resolveEnsureStaticConfigImpl(
  tree: LoaderTree
): Promise<EnsureStaticWithSource> {
  const { mod: layoutOrPageMod, filePath } = await getLayoutOrPageModule(tree)

  const config = getEnsureStaticConfigForModule(layoutOrPageMod)

  const parentResult: EnsureStaticWithSource = {
    config,
    filePath: filePath ?? null,
  }

  // Walk the slots if any and validate that they don't have incompatible configs
  // with each other. If compatible, pick the most constrained value from the slots.
  let slotsResult: EnsureStaticWithSource | null = null
  let slotResultKey: string | null = null
  const { parallelRoutes } = parseLoaderTree(tree)
  for (const parallelRouteKey in parallelRoutes) {
    const parallelRoute = parallelRoutes[parallelRouteKey]
    const childResult = await resolveEnsureStaticConfigImpl(parallelRoute)
    if (!slotsResult) {
      slotsResult = childResult
      slotResultKey = parallelRouteKey
    } else {
      // Check if the child is compatible with the current result for the slots.
      switch (compareEnsureStatic(childResult.config, slotsResult.config)) {
        case Comparison.Compatible: {
          // 'auto' is compatible with anything, but if the current result is 'auto' and the new one isn't,
          // we want to use the more specific result.
          if (slotsResult.config === 'auto' && childResult.config !== 'auto') {
            slotsResult = childResult
            slotResultKey = parallelRouteKey
          }
          break
        }
        case Comparison.Incompatible:
        case Comparison.LessConstrained:
        case Comparison.MoreConstrained: {
          throw new Error(
            `Parallel slots cannot have incompatible \`unstable_ensureStatic\`.` +
              `\n  ${formatParallelSlot(slotResultKey!)}: ` +
              `\n    ${formatEnsureStaticExport(slotsResult.config)}` +
              `\n    (from: ${slotsResult.filePath})` +
              `\n` +
              `\n  ${formatParallelSlot(parallelRouteKey)}: ` +
              `\n    ${formatEnsureStaticExport(childResult.config)}` +
              `\n    (from: ${childResult.filePath})` +
              `\n` +
              `\n Possible fixes:` +
              `\n - Remove one of the \`unstable_ensureStatic\` exports` +
              `\n - Change one of the  \`unstable_ensureStatic\` exports to match the other`
          )
        }
      }
    }
  }

  // Child segments can override the config from the parent with a more constrained value,
  // but they cannot have a less constrained value.
  if (!slotsResult) {
    return parentResult
  } else {
    const comparison = compareEnsureStatic(
      slotsResult.config,
      parentResult.config
    )
    switch (comparison) {
      case Comparison.Compatible: {
        // 'auto' is compatible with anything, but if the parent result is 'auto' and the slots one isn't,
        // we want to use the more constrained result.
        if (parentResult.config === 'auto' && slotsResult.config !== 'auto') {
          return slotsResult
        } else {
          return parentResult
        }
      }
      case Comparison.MoreConstrained: {
        return slotsResult
      }
      case Comparison.LessConstrained:
      case Comparison.Incompatible: {
        throw new Error(
          (comparison === Comparison.LessConstrained
            ? `A child segment cannot override a parent segment with a less-constrained \`unstable_ensureStatic\`.`
            : `A child segment cannot override a parent segment with an incompatible \`unstable_ensureStatic\`.`) +
            `\n  Parent has: ` +
            `\n    ${formatEnsureStaticExport(parentResult.config)}` +
            `\n    (from: ${parentResult.filePath})` +
            `\n  Child has: ` +
            `\n    ${formatEnsureStaticExport(slotsResult.config)}` +
            `\n    (from: ${slotsResult.filePath})` +
            `\n` +
            `\n Possible fixes:` +
            `\n - Remove one of the \`unstable_ensureStatic\` exports` +
            `\n - Change one of the  \`unstable_ensureStatic\` exports to match the other`
        )
      }
    }
  }
}

function formatParallelSlot(slot: string) {
  return slot === 'children' ? slot : `@${slot}`
}

function formatEnsureStaticExport(config: EnsureStatic) {
  return `export const unstable_ensureStatic = ${JSON.stringify(config)}`
}

enum Comparison {
  LessConstrained = 1,
  Compatible = 2,
  MoreConstrained = 3,
  Incompatible = 4,
}

const ENSURE_STATIC_ORDER: Exclude<EnsureStatic, 'auto' | false>[] = [
  'shell',
  'prefetch',
  'navigation',
]

function compareEnsureStatic(
  left: EnsureStatic,
  right: EnsureStatic
): Comparison {
  // 'auto' is compatible with everything.
  if (left === 'auto' || right === 'auto') {
    return Comparison.Compatible
  }

  // `false` is compatible with false.
  if (left === false && right === false) {
    return Comparison.Compatible
  }
  // If only one of the values is `false` (we know it's not both), it's incompatible.
  if (left === false || right === false) {
    return Comparison.Incompatible
  }

  const leftSort = ENSURE_STATIC_ORDER.indexOf(left)
  const rightSort = ENSURE_STATIC_ORDER.indexOf(right)
  return leftSort < rightSort
    ? Comparison.LessConstrained
    : leftSort === rightSort
      ? Comparison.Compatible
      : Comparison.MoreConstrained
}

function getEnsureStaticConfigForModule(
  mod: Record<string, any> | undefined
): EnsureStatic {
  return (
    (mod ? (mod as AppSegmentConfig).unstable_ensureStatic : undefined) ??
    'auto'
  )
}
