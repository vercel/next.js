import type { RouteDefinition } from '../../route-definition'

type Matcher<D> = (d: D) => boolean

type MatcherSpec<D extends Record<string, unknown>, K extends keyof D> = {
  key: K
  matcher: Matcher<D[K]>
}

export function createMatcher<D extends Record<string, unknown>>(
  spec: D
): Matcher<D> {
  const matchers: Array<MatcherSpec<D, keyof D>> = []

  for (const key of Object.keys(spec) as (keyof D)[]) {
    const value = spec[key]

    // If the value is undefined, then skip it, we can't filter for that.
    if (typeof value === 'undefined') continue

    // If the value is an array, we can't handle it so throw an error.
    if (Array.isArray(value)) {
      throw new Error(
        `Cannot create a matcher for an array. Key: ${key.toString()}, value: ${value}`
      )
    }

    // If the value is an object, then create a matcher that checks the object
    // recursively.
    if (typeof value === 'object' && value !== null) {
      matchers.push({
        key,
        matcher: createMatcher(value as Record<string, unknown>) as any,
      })
    }

    // Otherwise, create a matcher that checks to see if the value matches.
    else {
      matchers.push({
        key,
        matcher: (d) => d === value,
      })
    }
  }

  // Return a function that checks to see if all the matchers match.
  return (d) => {
    for (const { key, matcher } of matchers) {
      if (!matcher(d[key])) return false
    }

    return true
  }
}

export type RouteDefinitionFilter<D extends RouteDefinition = RouteDefinition> =
  Matcher<D>

export type RouteDefinitionFilterSpec<
  D extends RouteDefinition = RouteDefinition
> = Partial<D>

export function createRouteDefinitionFilter<
  D extends RouteDefinition = RouteDefinition
>(spec: RouteDefinitionFilterSpec<D>): RouteDefinitionFilter<D> {
  return createMatcher(spec)
}
