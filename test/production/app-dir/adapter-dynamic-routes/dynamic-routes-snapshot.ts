type RouteCondition = {
  type: string
  key: string
  value?: string
}

export type DynamicRouteEntry = {
  source: string
  sourceRegex: string
  destination: string
  has?: RouteCondition[]
  missing?: RouteCondition[]
}

export type AdapterRouting = {
  dynamicRoutes: DynamicRouteEntry[]
}

/**
 * Formats the dynamic routes as one block per entry.
 *
 * The output carries three things:
 *
 * - The entry count.
 * - The fields that a collapse rewrites: `sourceRegex` and `destination`.
 * - The conditions that allow a merge: `has` and `missing`.
 *
 * The output omits every other field of the adapter payload. An unrelated
 * change to the build output then leaves the snapshot alone.
 *
 * The entries keep the order that the build emits. That order is part of the
 * contract:
 *
 * - A fallback shell comes before its source page.
 * - A static segment comes before a dynamic segment in the same position.
 */
export function serializeDynamicRoutes(routes: DynamicRouteEntry[]): string {
  const blocks = routes.map((route) => {
    const conditions = [
      ...(route.has ?? []).map(
        (condition) => `has ${condition.type} ${condition.key}`
      ),
      ...(route.missing ?? []).map(
        (condition) => `missing ${condition.type} ${condition.key}`
      ),
    ]

    const conditionLine =
      conditions.length > 0 ? `\n  [${conditions.join(', ')}]` : ''

    return `${route.source}\n  ${route.sourceRegex}\n  -> ${route.destination}${conditionLine}`
  })

  return `${routes.length} entries\n\n${blocks.join('\n\n')}`
}
