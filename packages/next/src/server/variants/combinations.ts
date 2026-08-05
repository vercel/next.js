import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import { hashVariants } from './hash'

/**
 * One declared combination: which values it assigns, and the hash naming the
 * prerender produced for it.
 */
export interface VariantCombination {
  /**
   * Names the combination's prerender. Membership in a group is what makes a
   * request's combination one that was declared.
   */
  hash: string
  /**
   * The values assigned, positional against the group's `keys`.
   */
  values: string[]
}

/**
 * The declared combinations that assign one particular set of variants. A
 * combination need not assign every variant the route reads, so a route can
 * declare several groups: `[[theme, 'dark']]` and `[[theme, 'light'], [locale,
 * 'de']]` are two, and the variants a group leaves out stay dynamic holes in
 * the prerenders it produces.
 */
export interface VariantCombinationGroup {
  /**
   * The variant identities every combination in this group assigns, sorted, so
   * that the group is identified by its shape rather than by declaration order.
   */
  keys: string[]
  /**
   * Every combination declared for this shape.
   *
   * The values are carried rather than only their hashes because a request does
   * not always arrive with values beside it. A platform filling or revalidating
   * a prerender rebuilds the request from the artifact, and all that survives
   * that is the hash in the path. What a declared combination assigns is fixed
   * at build time, so the origin can recover it here instead of depending on
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
 * A group's combinations by hash, with the values zipped back against the
 * group's keys, built once per group rather than per request.
 *
 * The groups arrive as JSON from the prerender manifest, which is read once per
 * server, so the group objects are stable enough to key on and rebuilding this
 * for every request would defeat the point of storing the combinations at all.
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

    if (getCombinations(group).has(hash)) {
      return { values, hash }
    }
  }

  return null
}

/**
 * Recovers a declared combination from the hash that names it, or null when the
 * hash names none of this route's combinations.
 *
 * This is how the origin learns what a request's artifact bakes. The hash
 * travels in the path and survives everything, including a request a platform
 * rebuilt from the artifact rather than routed, whereas the values travel in a
 * header that such a request does not carry. Since only a declared combination
 * ever reaches a hash, going through the build's own record of them is both
 * sufficient and the one answer that cannot disagree with what was prerendered.
 */
export function findVariantCombinationByHash(
  groups: DeepReadonly<VariantCombinationGroups>,
  hash: string
): { values: Record<string, string>; hash: string } | null {
  for (const group of groups) {
    const values = getCombinations(group).get(hash)

    if (values) {
      // Copied because the map is shared across requests and what a render
      // receives should not be able to alter what the next one does.
      return { values: { ...values }, hash }
    }
  }

  return null
}

/**
 * Separates the variants a request resolved into the ones a prerender for it
 * fixes and the ones no prerender can.
 *
 * The split is what stores are seeded from, so that a render is given only what
 * it may bake: a static prerender receives the first half and nothing else, and
 * a variant it must not bake becomes one it does not have.
 *
 * The halves come from different places, so neither implies the other. The
 * fixed half is the combination the build declared, recovered from the hash
 * naming the artifact; the rest is whatever else the request carried. A render
 * rebuilt from an artifact carries nothing, and still has a fixed half.
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
