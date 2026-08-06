import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import { hashVariants } from './hash'

/**
 * One declared combination. It holds the values the combination assigns, and
 * the hash that names the prerender produced for it.
 */
export interface VariantCombination {
  /**
   * Names the prerender of this combination. The combination a request resolves
   * is a declared one when a group contains its hash.
   */
  hash: string
  /**
   * The values assigned. They are positional against the `keys` of the group.
   */
  values: string[]
}

/**
 * The declared combinations that assign one particular set of variants.
 *
 * A combination does not have to assign every variant that the route reads.
 * Therefore a route can declare several groups. For example, `[[theme,
 * 'dark']]` and `[[theme, 'light'], [locale, 'de']]` are two groups. The
 * variants a group leaves out stay dynamic holes in the prerenders it produces.
 */
export interface VariantCombinationGroup {
  /**
   * The variant identities that every combination in this group assigns. They
   * are sorted, so that the shape of the group identifies it, and not the order
   * of declaration.
   */
  keys: string[]
  /**
   * Every combination declared for this shape.
   *
   * This holds the values, and not only their hashes, because a request does
   * not always arrive with values beside it. When a platform fills or
   * revalidates a prerender, it rebuilds the request from the artifact, and
   * only the hash in the path survives. What a declared combination assigns is
   * fixed at build time, so the origin recovers it here, and does not depend on
   * the request to carry it.
   */
  combinations: VariantCombination[]
}

/**
 * Declared combinations grouped by which variants they assign, most specific
 * group first.
 */
export type VariantCombinationGroups = VariantCombinationGroup[]

/**
 * Groups a route's declared combinations by the variants they assign.
 *
 * The groups are what let a request be matched without a scan. The keys of a
 * group say which of the values of the request to consider, and the number of
 * combinations never enters the comparison. The order is most specific first,
 * because a combination that assigns more variants leaves fewer holes.
 * Therefore when two combinations match one request, the larger one is the
 * better prerender to serve.
 *
 * This runs at build time, so the runtime does not group or sort for each
 * request.
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
      group = { keys, combinations: [] }
      groupsBySignature.set(signature, group)
    }

    group.combinations.push({
      hash: hashVariants(combination),
      values: group.keys.map((key) => combination[key]),
    })
  }

  return [...groupsBySignature.values()].sort(
    (a, b) => b.keys.length - a.keys.length
  )
}

/**
 * The combinations of a group by hash, with each value paired again with the
 * key at its position. Built once per group, and not once per request.
 *
 * The groups are JSON from the prerender manifest, which the server reads once,
 * so the group objects are stable enough to key on. To rebuild this for every
 * request would defeat the purpose of storing the combinations at all.
 */
const combinationsByGroup = new WeakMap<
  DeepReadonly<VariantCombinationGroup>,
  Map<string, Record<string, string>>
>()

function getCombinations(
  group: DeepReadonly<VariantCombinationGroup>
): Map<string, Record<string, string>> {
  let combinations = combinationsByGroup.get(group)

  if (!combinations) {
    combinations = new Map()

    for (const { hash, values } of group.combinations) {
      const assigned: Record<string, string> = {}

      group.keys.forEach((key, index) => {
        assigned[key] = values[index]
      })

      combinations.set(hash, assigned)
    }

    combinationsByGroup.set(group, combinations)
  }

  return combinations
}

/**
 * Finds the combination a request was prerendered against. The result is null
 * when the request was prerendered against none.
 *
 * The values a request resolved cannot be hashed as they are. They include
 * every variant the proxy resolved, and a declared combination assigns only
 * some of them, so the two hashes would never agree. The keys of each group say
 * which values to select before hashing. Those keys come from the build, which
 * is what makes the selection possible before anything knows which variants are
 * dynamic.
 *
 * The result therefore answers both questions a render has. Its `values` are
 * the ones the prerender contains, and every other resolved variant is a hole.
 * A null result means that all of them are holes.
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
      // describe the request. There is nothing to select, so skip the group.
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

    if (getCombinations(group).has(hash)) {
      return { values, hash }
    }
  }

  return null
}

/**
 * Recovers a declared combination from the hash that names it. The result is
 * null when the hash names no combination of this route.
 *
 * This is how the origin learns what the artifact of a request contains. The
 * hash travels in the path and survives everything, including a request that a
 * platform rebuilt from the artifact instead of routing it. The values travel
 * in a header, and such a request does not carry one. Only a declared
 * combination ever reaches a hash, so the record the build made of them is
 * sufficient here, and it is the one answer that cannot disagree with what was
 * prerendered.
 */
export function findVariantCombinationByHash(
  groups: DeepReadonly<VariantCombinationGroups>,
  hash: string
): { values: Record<string, string>; hash: string } | null {
  for (const group of groups) {
    const values = getCombinations(group).get(hash)

    if (values) {
      // Copied, because requests share the map. What one render receives must
      // not change what the next render receives.
      return { values: { ...values }, hash }
    }
  }

  return null
}

/**
 * Separates the variants a request resolved into the ones a prerender for it
 * fixes, and the ones no prerender can fix.
 *
 * The stores are seeded from this split, so that a render receives only what it
 * may contain. A static prerender receives the first half and nothing else, and
 * a variant it must not contain becomes a variant it does not have.
 *
 * The two halves come from different places, and neither implies the other. The
 * fixed half is the combination the build declared, recovered from the hash
 * that names the artifact. The rest is whatever else the request carried. A
 * render rebuilt from an artifact carries nothing, and it still has a fixed
 * half.
 */
export function splitVariantsByTier(
  resolved: Readonly<Record<string, string>> | undefined,
  matched: { values: Record<string, string> } | null
): {
  staticVariants: Record<string, string> | null
  runtimeVariants: Record<string, string> | null
} {
  const runtimeVariants: Record<string, string> = {}
  let hasRuntimeVariants = false

  if (resolved) {
    for (const [key, value] of Object.entries(resolved)) {
      if (matched && key in matched.values) {
        continue
      }

      runtimeVariants[key] = value
      hasRuntimeVariants = true
    }
  }

  return {
    staticVariants: matched?.values ?? null,
    runtimeVariants: hasRuntimeVariants ? runtimeVariants : null,
  }
}
