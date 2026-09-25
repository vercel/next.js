export type IncompatibleParallelRouteSlots = {
  layoutFile: string
  route: string
  missingSlots: readonly string[]
}

export class IncompatibleParallelRouteSlotsError extends Error {
  constructor(routes: readonly IncompatibleParallelRouteSlots[]) {
    const routesByLayout = new Map<string, IncompatibleParallelRouteSlots[]>()

    for (const route of routes) {
      const layoutRoutes = routesByLayout.get(route.layoutFile)
      if (layoutRoutes) {
        layoutRoutes.push(route)
      } else {
        routesByLayout.set(route.layoutFile, [route])
      }
    }

    const formattedLayouts = [...routesByLayout]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([layoutFile, layoutRoutes]) => {
        const formattedRoutes = layoutRoutes
          .sort((a, b) => a.route.localeCompare(b.route))
          .map(
            ({ route, missingSlots }) =>
              `- ${route} is missing a matching page or default.tsx in ${missingSlots.join(', ')}`
          )
          .join('\n')
        return `${layoutFile}\n${formattedRoutes}`
      })
      .join('\n\n')

    super(
      `The following layouts have parallel route slots that cannot render the same URLs:\n${formattedLayouts}\n\nEvery URL matched by one slot must have a matching page or default.tsx in every sibling slot.`
    )

    this.name = 'IncompatibleParallelRouteSlotsError'
    this.stack = undefined
  }
}
