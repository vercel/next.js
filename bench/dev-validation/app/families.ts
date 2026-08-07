// The benchmark's route families and the nested segments each route sits under.
// Keep in sync with scripts/generate.mjs, which generates the matching routes
// and heavy components. Committed (not generated) so the layout and page
// type-check on their own.
//
// Dev validation renders a combined payload at every URL depth (see
// `validateInstantConfigs`), so its cost scales with route depth. The routes
// nest several layout segments to mirror a realistically deep app rather than a
// single flat segment.
export const FAMILIES = ['client', 'server', 'sprite'] as const

export const NEST_SEGMENTS = ['s1', 's2', 's3', 's4'] as const

// The generated routes live in a `(routes)` route group, which does not appear
// in the URL, so a family's path is just the family segment plus NEST_SEGMENTS.
export function familyHref(family: string): string {
  return `/${family}/${NEST_SEGMENTS.join('/')}`
}
