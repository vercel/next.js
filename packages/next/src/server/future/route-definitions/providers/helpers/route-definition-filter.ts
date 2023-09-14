import type { RouteDefinition } from '../../route-definition'

export type RouteDefinitionFilterSpec<
  D extends RouteDefinition = RouteDefinition
> = Partial<D>

export type RouteDefinitionFilter<D extends RouteDefinition = RouteDefinition> =
  (definition: D) => boolean

export function createRouteDefinitionFilter<
  D extends RouteDefinition = RouteDefinition
>(spec: RouteDefinitionFilterSpec<D>): (d: D) => boolean {
  const keys = (Object.keys(spec) as Array<keyof D>).filter(
    (key) => typeof spec[key] !== 'undefined'
  )

  return (d) => {
    for (const key of keys) {
      const test = spec[key]

      // If the value in the spec is an array, then check to see if the value is
      // any of the values in the array.
      if (Array.isArray(test)) {
        if (!test.includes(d[key])) {
          return false
        }
      }

      // If the value does not match, then return false.
      else if (d[key] !== test) {
        return false
      }
    }

    // Otherwise, return true.
    return true
  }
}
