import type { DeepReadonly } from '../../shared/lib/deep-readonly'

import { hashVariants } from './encoding'

/**
 * One static variant combination a page declared.
 */
export interface VariantCombination {
  /**
   * The hash of this combination. It is the path segment under which the
   * prerender for this combination is written.
   */
  hash: string

  /**
   * The values the combination assigns, positional against the `keys` of the
   * group that holds it.
   *
   * The values are carried and not only the hash, because a request does not
   * always arrive with them. A platform that fills or revalidates a prerender
   * rebuilds the request from the artifact. Only the hash in the path survives
   * that.
   */
  values: string[]
}

/**
 * The static variant combinations a page declared that assign one particular
 * set of variants.
 *
 * A combination does not have to assign every variant a page reads, so one page
 * can declare several groups. For example `[[theme, 'dark']]` and `[[theme,
 * 'light'], [locale, 'en']]` are two groups. The variants a group leaves out
 * stay dynamic holes in the prerenders it produces.
 */
export interface VariantCombinationGroup {
  /**
   * The variant identities that every combination in this group assigns,
   * sorted. The shape of the group therefore identifies it, and the order a
   * page declared them in does not.
   */
  keys: string[]

  /**
   * Every combination declared for this shape.
   */
  combinations: VariantCombination[]
}

/**
 * The variant combination groups of one page, most specific first.
 *
 * A combination that assigns more variants leaves fewer holes, so when two of
 * them match one request, the larger one is the better prerender to serve. The
 * build sorts them, so that the runtime does not sort for each request.
 */
export type VariantCombinationGroups = VariantCombinationGroup[]

/**
 * Finds the variant combination a request matched, and returns null when no
 * declared combination describes it.
 *
 * The values a request resolved cannot be hashed as they arrive. They hold
 * every variant the route reads, while a declared combination assigns only some
 * of them, so the two hashes would never agree. The `keys` of each group say
 * which values to select first. The hash of that projection is what identifies
 * the combination.
 *
 * The groups arrive sorted most specific first, so the first group that matches
 * is the one leaving fewest holes.
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

      // A group that assigns a variant this request never resolved cannot
      // describe it, so there is nothing to select.
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

    for (const combination of group.combinations) {
      if (combination.hash === hash) {
        return { values, hash }
      }
    }
  }

  return null
}

/**
 * Recovers a declared combination from its hash, and returns null for a hash
 * no group holds.
 *
 * A request does not always arrive with the resolved values beside it. A
 * platform that fills or revalidates a prerender rebuilds the request from the
 * artifact, where the hash in the path is all that survives, which is why the
 * groups carry values and not hashes alone.
 */
export function findVariantCombinationByHash(
  groups: DeepReadonly<VariantCombinationGroups>,
  hash: string
): { values: Record<string, string>; hash: string } | null {
  for (const group of groups) {
    for (const combination of group.combinations) {
      if (combination.hash !== hash) {
        continue
      }

      const values: Record<string, string> = {}

      group.keys.forEach((key, index) => {
        values[key] = combination.values[index]
      })

      return { values, hash }
    }
  }

  return null
}
