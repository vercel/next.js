import type { RouteDefinition } from '../../route-definition'

import {
  type LocaleRouteDefinition,
  type LocaleRouteInfo,
  isLocaleRouteInfo,
} from '../../locale-route-info'

export type RouteDefinitionFilter<D extends RouteDefinition = RouteDefinition> =
  (d: D) => boolean

export type RouteDefinitionFilterSpec<
  D extends RouteDefinition = RouteDefinition
> = Partial<
  Omit<D, Extract<keyof D, object>> &
    (D extends LocaleRouteInfo ? LocaleRouteInfo : {})
>

export function createRouteDefinitionFilter<
  D extends RouteDefinition | LocaleRouteDefinition =
    | RouteDefinition
    | LocaleRouteDefinition
>(spec: RouteDefinitionFilterSpec<D>): RouteDefinitionFilter<D> {
  // Remove all the keys that are references to objects or have undefined as
  // their value.
  const keys = (Object.keys(spec) as Extract<keyof D, object>[]).filter(
    (key) => {
      return typeof spec[key] !== 'undefined' && typeof spec[key] !== 'object'
    }
  )

  return (definition: D) => {
    for (const key of keys) {
      const value = definition[key]

      // If the value in the definition is undefined, then it doesn't match the
      // spec which is filtering for it.
      if (typeof value === 'undefined') return false

      // If the value doesn't match the one in the spec, then the definition
      // doesn't match the spec.
      if (value !== spec[key]) return false
    }

    // Check for the i18n property.
    if (isLocaleRouteInfo(spec)) {
      // If the definition doesn't have an i18n property, then it doesn't match
      // the spec.
      if (!isLocaleRouteInfo(definition)) return false

      // If the detected locale doesn't match, then the definition doesn't
      // match.
      if (definition.i18n.detectedLocale !== spec.i18n.detectedLocale) {
        return false
      }

      // If the pathname doesn't match, then the definition doesn't match.
      if (definition.i18n.pathname !== spec.i18n.pathname) {
        return false
      }
    }

    // If we got here, then the definition matches the spec.
    return true
  }
}
