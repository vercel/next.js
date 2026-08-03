import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import { hashVariants } from './hash'

/**
 * The declared combinations that assign one particular set of variants, and the
 * hash of each. A combination need not assign every variant the route reads, so
 * a route can declare several groups: `[[theme, 'dark']]` and `[[theme,
 * 'light'], [locale, 'de']]` are two, and the variants a group leaves out stay
 * dynamic holes in the prerenders it produces.
 */
export interface VariantCombinationGroup {
  /**
   * The variant identities every combination in this group assigns, sorted, so
   * that the group is identified by its shape rather than by declaration order.
   */
  keys: string[]
  /**
   * The hash of each declared combination, which is also what names its
   * prerender. Membership here is what makes a request's combination one that
   * was declared.
   */
  hashes: string[]
}

/**
 * Declared combinations grouped by which variants they assign, most specific
 * group first.
 */
export type VariantCombinationGroups = VariantCombinationGroup[]

/**
 * Groups a route's declared combinations by the variants they assign.
 *
 * Grouping is what lets a request be matched without scanning: the group's keys
 * say which of the request's values to consider, and the combination count
 * never enters the comparison. Ordering is most specific first, because a
 * combination that assigns more variants leaves fewer holes, so when two of
 * them match one request the larger one is the better prerender to serve.
 *
 * Done at build time so the runtime neither groups nor sorts per request.
 */
export function groupVariantCombinations(
  combinations: ReadonlyArray<Record<string, string>>
): VariantCombinationGroups {
  const groupsBySignature = new Map<string, VariantCombinationGroup>()

  for (const combination of combinations) {
    const keys = Object.keys(combination).sort()
    const signature = JSON.stringify(keys)

    let group = groupsBySignature.get(signature)

    if (!group) {
      group = { keys, hashes: [] }
      groupsBySignature.set(signature, group)
    }

    group.hashes.push(hashVariants(combination))
  }

  return [...groupsBySignature.values()].sort(
    (a, b) => b.keys.length - a.keys.length
  )
}

/**
 * Set of a group's hashes, built once per group rather than per request.
 *
 * The groups arrive as JSON from the prerender manifest, which is read once per
 * server, so the group objects are stable enough to key on and rebuilding the
 * set for every request would defeat the point of storing hashes at all.
 */
const hashesByGroup = new WeakMap<
  DeepReadonly<VariantCombinationGroup>,
  Set<string>
>()

function getHashes(group: DeepReadonly<VariantCombinationGroup>): Set<string> {
  let hashes = hashesByGroup.get(group)

  if (!hashes) {
    hashes = new Set(group.hashes)
    hashesByGroup.set(group, hashes)
  }

  return hashes
}

/**
 * Finds the combination a request was prerendered against, or null when it was
 * prerendered against none.
 *
 * The values a request resolved cannot be hashed as they are: they include
 * every variant the proxy resolved, while a declared combination only assigns
 * some, so the two hashes would never agree. Each group's keys are what say
 * which values to project onto before hashing, and they come from the build,
 * which is what makes the projection possible before anything is known about
 * which variants are dynamic.
 *
 * The result therefore answers both questions a render has: its `values` are
 * the ones baked into the prerender, and every other resolved variant is a
 * hole. A null result means all of them are.
 */
export function findMatchingVariantCombination(
  groups: DeepReadonly<VariantCombinationGroups>,
  resolved: Readonly<Record<string, string>>
): { values: Record<string, string>; hash: string } | null {
  for (const group of groups) {
    const values: Record<string, string> = {}
    let assignsEveryKey = true

    for (const key of group.keys) {
      const value = resolved[key]

      // A group assigning a variant this request never resolved cannot describe
      // it, so there is nothing to project and the group is skipped.
      if (value === undefined) {
        assignsEveryKey = false
        break
      }

      values[key] = value
    }

    if (!assignsEveryKey) {
      continue
    }

    const hash = hashVariants(values)

    if (getHashes(group).has(hash)) {
      return { values, hash }
    }
  }

  return null
}
