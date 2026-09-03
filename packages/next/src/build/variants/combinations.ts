import type { AppSegment } from '../segment-config/app/app-segments'
import type { PrerenderedRoute } from '../static-paths/types'
import type {
  VariantCombinationGroup,
  VariantCombinationGroups,
} from '../../server/variants/combinations'

import {
  assertValidVariantValue,
  getVariantKey,
  isVariant,
} from '../../server/request/variants'
import { hashVariants } from '../../server/variants/encoding'

/**
 * Normalizes one combination that `unstable_generateStaticVariants` returned
 * into a record keyed by variant identity, and rejects a malformed one.
 *
 * The parameter is `unknown` because the value comes from user code. The types
 * describe what a combination should be, and this function establishes that it
 * is one.
 */
function normalizeVariantAssignments(
  assignments: unknown,
  route: string
): Record<string, string> {
  if (!Array.isArray(assignments)) {
    throw new Error(
      `\`unstable_generateStaticVariants\` for ${route} returned a combination that is not an array. Each combination is a list of \`[variant, value]\` tuples.`
    )
  }

  const values: Record<string, string> = {}

  for (const assignment of assignments) {
    if (!Array.isArray(assignment) || assignment.length !== 2) {
      throw new Error(
        `\`unstable_generateStaticVariants\` for ${route} returned a combination containing something that is not a \`[variant, value]\` tuple.`
      )
    }

    const [variant, value] = assignment

    if (!isVariant(variant)) {
      throw new Error(
        `\`unstable_generateStaticVariants\` for ${route} assigned a value to something that is not a variant. Use the value exported from a \`'use variants'\` module, for example \`[theme, 'dark']\`.`
      )
    }

    const key = getVariantKey(variant)

    if (key in values) {
      throw new Error(
        `\`unstable_generateStaticVariants\` for ${route} assigned the variant \`${key}\` more than once in one combination. A variant takes one value per combination.`
      )
    }

    values[key] = assertValidVariantValue(key, value, 'assignment')
  }

  return values
}

/**
 * Calls `unstable_generateStaticVariants` for a route and returns the static
 * variant combinations it declared, each normalized to a record keyed by
 * variant identity. A route that declares none produces an empty list. A
 * combination that cannot be used throws.
 *
 * At most one segment can carry the export, because `collectSegments` rejects
 * it anywhere but on the page of a route.
 */
export async function collectStaticVariantCombinations(
  segments: ReadonlyArray<
    Readonly<Pick<AppSegment, 'unstable_generateStaticVariants'>>
  >,
  route: string
): Promise<Array<Record<string, string>>> {
  const generateStaticVariants = segments.find(
    (segment) => typeof segment.unstable_generateStaticVariants === 'function'
  )?.unstable_generateStaticVariants

  if (!generateStaticVariants) {
    return []
  }

  const returned: unknown = await generateStaticVariants()

  if (!Array.isArray(returned)) {
    throw new Error(
      `\`unstable_generateStaticVariants\` for ${route} did not return an array. Return a list of combinations, each a list of \`[variant, value]\` tuples.`
    )
  }

  const declared: readonly unknown[] = returned
  const combinations: Array<Record<string, string>> = []
  const seen = new Set<string>()

  for (const assignments of declared) {
    const values = normalizeVariantAssignments(assignments, route)

    if (Object.keys(values).length === 0) {
      throw new Error(
        `\`unstable_generateStaticVariants\` for ${route} returned an empty combination. A combination assigns at least one variant.`
      )
    }

    // The same combination declared twice would prerender the same artifact
    // twice, because the hash of the combination is what names it. Two
    // declarations of one combination hash alike whatever order they assign the
    // variants in.
    const hash = hashVariants(values)

    if (!seen.has(hash)) {
      seen.add(hash)
      combinations.push(values)
    }
  }

  assertUnambiguousVariantCombinations(combinations, route)

  return combinations
}

/**
 * Rejects two static variant combinations that one request can match with no
 * order between them.
 *
 * Two combinations are ordered when one assigns everything the other assigns
 * and more. The larger one is the more specific, and that is how a page covers
 * a route both broadly and narrowly.
 *
 * Two combinations that each assign a variant the other leaves out have no such
 * order. One of two things is then true:
 *
 * - They disagree on a variant they share, so no request matches both.
 * - They agree wherever they overlap, so one request matches both.
 *
 * This function rejects the second, because nothing decides between them.
 */
function assertUnambiguousVariantCombinations(
  combinations: ReadonlyArray<Record<string, string>>,
  route: string
): void {
  for (let i = 0; i < combinations.length; i++) {
    for (let j = i + 1; j < combinations.length; j++) {
      const a = combinations[i]
      const b = combinations[j]
      const aKeys = Object.keys(a)
      const bKeys = Object.keys(b)

      if (aKeys.every((key) => key in b) || bKeys.every((key) => key in a)) {
        continue
      }

      // Neither combination assigns everything the other does, so the variants
      // they share decide. Two combinations that share none leave `shared`
      // empty, and `every` holds for an empty array, so this rejects them.
      const shared = aKeys.filter((key) => key in b)

      if (shared.every((key) => a[key] === b[key])) {
        throw new Error(
          `\`unstable_generateStaticVariants\` for ${route} declared two combinations that a single request can match, neither of which is more specific than the other: ${JSON.stringify(a)} and ${JSON.stringify(b)}. Give one of them the other's variants as well, so that it is the more specific match, or give them different values for a variant they share so that no request matches both.`
        )
      }
    }
  }
}

/**
 * Groups the static variant combinations of one page by which variants they
 * assign, and orders the groups most specific first.
 *
 * A request resolves every variant its route reads, while a combination may
 * assign only some of them, so the resolved values cannot be hashed as they
 * arrive. The `keys` of a group say which values to select before hashing, and
 * that projection is what makes a partial combination findable.
 *
 * Each combination keeps its values positional against the sorted keys of its
 * group, which is the form the manifests carry.
 */
export function groupStaticVariantCombinations(
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

  // A combination that assigns more variants leaves fewer holes, so it is the
  // better prerender to serve when two of them match one request. `sort` is
  // stable, so groups of equal size keep the order the page declared them in.
  // The rejection of ambiguous pairs above is what stops that order from
  // deciding anything.
  return [...groupsBySignature.values()].sort(
    (a, b) => b.keys.length - a.keys.length
  )
}

/**
 * Multiplies the routes a page prerenders by the static variant combinations it
 * declared, in place.
 *
 * A combination belongs to the whole route, so it applies to every concrete
 * route the params produced and to every fallback shell alike. The copies
 * cannot share a map key, because combinations of one route share a pathname: a
 * prefix carries the hash of the combination, and routing removes that prefix
 * before it matches the route.
 *
 * Where the route is partially prerendered, this also keeps the route it did
 * not multiply, and marks it as the one that omits variants. A request whose
 * combination no page declared is served from that one entry, instead of each
 * value it happens to carry seeding an entry of its own. Without it a variant
 * with many values would grow the cache in proportion to traffic rather than to
 * what the page declared.
 *
 * Where the route is not partially prerendered there is no resume to fill the
 * hole a left-out variant leaves, so no such entry is kept. An undeclared
 * combination then renders dynamically for each request.
 */
export function expandPrerenderedRoutesByVariants(
  prerenderedRoutesByPathname: Map<string, PrerenderedRoute>,
  variantCombinations: ReadonlyArray<Record<string, string>>,
  isRoutePPREnabled: boolean
): void {
  if (variantCombinations.length === 0) {
    return
  }

  // Iterate over a snapshot, so that the copies added below are not expanded
  // again.
  for (const [key, prerenderedRoute] of [...prerenderedRoutesByPathname]) {
    if (isRoutePPREnabled) {
      prerenderedRoutesByPathname.set(key, {
        ...prerenderedRoute,
        omitsVariants: true,
      })
    } else {
      prerenderedRoutesByPathname.delete(key)
    }

    for (const variantValues of variantCombinations) {
      // Each copy is a distinct object, because later passes over these routes
      // write to them.
      prerenderedRoutesByPathname.set(
        `${key}\0${hashVariants(variantValues)}`,
        { ...prerenderedRoute, variantValues }
      )
    }
  }
}
