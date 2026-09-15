import type {
  AppSegmentConfig,
  RequireStatic,
} from '../../../build/segment-config/app/app-segment-config'
import { parseLoaderTree } from '../../../shared/lib/router/utils/parse-loader-tree'
import {
  getLayoutOrPageModule,
  type LoaderTree,
} from '../../lib/app-dir-module'

/**
 * The outcome of resolving a route's `requireStatic` config.
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
export enum RequireStaticLevel {
  /** The route follows standard Partial Prefetching semantics. */
  None = 0,
  /** The route requires that app shells must be statically prerendered. */
  Shell = 1,
  /** The route requires that app shells and prefetches must be statically prerendered. */
  Prefetch = 2,
  /** The route requires that app shells, prefetches, and the whole page must be statically prerendered. */
  Navigation = 3,
}

function getRequireStaticLevel(requireStatic: RequireStatic) {
  switch (requireStatic) {
    case 'auto':
    case false: {
      return RequireStaticLevel.None
    }
    case 'shell': {
      return RequireStaticLevel.Shell
    }
    case 'prefetch': {
      return RequireStaticLevel.Prefetch
    }
    case 'navigation': {
      return RequireStaticLevel.Navigation
    }
  }
}

export async function resolveRequireStaticLevel(
  tree: LoaderTree,
  partialPrefetching: boolean
): Promise<RequireStaticLevel> {
  let { config, filePath } = await resolveRequireStaticConfigImpl(tree)

  if (!partialPrefetching) {
    // If Partial Prefetching is not enabled for this route, we only support
    // a subset of `requireStatic` values.
    // (We error in `getAppPageStaticInfo` if `requireStatic` is used without enabling
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
        config = 'prefetch'
        console.warn(
          `${formatRequireStaticExport(config)} has no effect unless the route is using Partial Prefetching.` +
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

  if (config === 'navigation') {
    throw new Error(
      `\`${formatRequireStaticExport(config)}\` is not implemented yet.` +
        `\n  (from: ${filePath})` +
        ``
    )
  }

  return getRequireStaticLevel(config)
}

type RequireStaticWithSource = {
  config: RequireStatic
  filePath: string | null
}

async function resolveRequireStaticConfigImpl(
  tree: LoaderTree
): Promise<RequireStaticWithSource> {
  const { mod: layoutOrPageMod, filePath } = await getLayoutOrPageModule(tree)

  const config = getRequireStaticConfigForModule(layoutOrPageMod)

  const parentResult: RequireStaticWithSource = {
    config,
    filePath: filePath ?? null,
  }

  // Walk the slots if any and validate that they don't have incompatible configs
  // with each other. If compatible, pick the most constrained value from the slots.
  let slotsResult: RequireStaticWithSource | null = null
  let slotResultKey: string | null = null
  const { parallelRoutes } = parseLoaderTree(tree)
  for (const parallelRouteKey in parallelRoutes) {
    const parallelRoute = parallelRoutes[parallelRouteKey]
    const childResult = await resolveRequireStaticConfigImpl(parallelRoute)
    if (!slotsResult) {
      slotsResult = childResult
      slotResultKey = parallelRouteKey
    } else {
      // Check if the child is compatible with the current result for the slots.
      switch (compareRequireStatic(childResult.config, slotsResult.config)) {
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
            `Parallel slots cannot have incompatible \`unstable_requireStatic\`.` +
              `\n  ${formatParallelSlot(slotResultKey!)}: ` +
              `\n    ${formatRequireStaticExport(slotsResult.config)}` +
              `\n    (from: ${slotsResult.filePath})` +
              `\n` +
              `\n  ${formatParallelSlot(parallelRouteKey)}: ` +
              `\n    ${formatRequireStaticExport(childResult.config)}` +
              `\n    (from: ${childResult.filePath})` +
              `\n` +
              `\n Possible fixes:` +
              `\n - Remove one of the \`unstable_requireStatic\` exports` +
              `\n - Change one of the  \`unstable_requireStatic\` exports to match the other`
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
    const comparison = compareRequireStatic(
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
            ? `A child segment cannot override a parent segment with a less-constrained \`unstable_requireStatic\`.`
            : `A child segment cannot override a parent segment with an incompatible \`unstable_requireStatic\`.`) +
            `\n  Parent has: ` +
            `\n    ${formatRequireStaticExport(parentResult.config)}` +
            `\n    (from: ${parentResult.filePath})` +
            `\n  Child has: ` +
            `\n    ${formatRequireStaticExport(slotsResult.config)}` +
            `\n    (from: ${slotsResult.filePath})` +
            `\n` +
            `\n Possible fixes:` +
            `\n - Remove one of the \`unstable_requireStatic\` exports` +
            `\n - Change one of the  \`unstable_requireStatic\` exports to match the other`
        )
      }
    }
  }
}

function formatParallelSlot(slot: string) {
  return slot === 'children' ? slot : `@${slot}`
}

function formatRequireStaticExport(config: RequireStatic) {
  return `export const unstable_requireStatic = ${JSON.stringify(config)}`
}

enum Comparison {
  LessConstrained = 1,
  Compatible = 2,
  MoreConstrained = 3,
  Incompatible = 4,
}

const REQUIRE_STATIC_ORDER: Exclude<RequireStatic, 'auto' | false>[] = [
  'shell',
  'prefetch',
  'navigation',
]

function compareRequireStatic(
  left: RequireStatic,
  right: RequireStatic
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

  const leftSort = REQUIRE_STATIC_ORDER.indexOf(left)
  const rightSort = REQUIRE_STATIC_ORDER.indexOf(right)
  return leftSort < rightSort
    ? Comparison.LessConstrained
    : leftSort === rightSort
      ? Comparison.Compatible
      : Comparison.MoreConstrained
}

function getRequireStaticConfigForModule(
  mod: Record<string, any> | undefined
): RequireStatic {
  return (
    (mod ? (mod as AppSegmentConfig).unstable_requireStatic : undefined) ??
    'auto'
  )
}
