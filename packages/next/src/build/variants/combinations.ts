import type { AppSegment } from '../segment-config/app/app-segments'

import {
  assertValidVariantValue,
  getVariantKey,
  isVariant,
} from '../../server/request/variants'

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

  for (const assignments of declared) {
    const values = normalizeVariantAssignments(assignments, route)

    if (Object.keys(values).length === 0) {
      throw new Error(
        `\`unstable_generateStaticVariants\` for ${route} returned an empty combination. A combination assigns at least one variant.`
      )
    }

    combinations.push(values)
  }

  assertUnambiguousVariantCombinations(combinations, route)

  return combinations
}

/**
 * Rejects two combinations that one request can match with no order between
 * them.
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
