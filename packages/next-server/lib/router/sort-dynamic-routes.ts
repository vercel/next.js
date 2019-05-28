import { getRouteMatch } from "./utils";

interface IDynamicRoute {
  page: string
  match: ReturnType<typeof getRouteMatch>
}

/*
  Dynamic routes prioritization
  1. Break up each path part '/a/$b' => [a, $b]
  2. Prioritize path with non-dynamic parts over dynamic parts
  3. Prioritize non-optional over optional '/a/$b' comes before '/a/$b$'
*/
export default function sortDynamicRoutes(
  dynamicRoutes: IDynamicRoute[]): IDynamicRoute[] {
  return dynamicRoutes.sort(({ page: a }, { page: b }) => {
    a = a.startsWith('/') ? a.substr(1) : a
    b = b.startsWith('/') ? b.substr(1) : b
    const aParts = a.split('/')
    const bParts = b.split('/')

    for (let i = 0; (i < aParts.length && i < bParts.length); i++) {
      const aPart = aParts[i]
      const bPart = bParts[i]
      const aPartIsDynamic = !!(aPart.match(/^\$/))
      const bPartIsDynamic = !!(bPart.match(/^\$/))
      const aPartIsOptional = !!(aPartIsDynamic && aPart.match(/\$$/))
      const bPartIsOptional = !!(bPartIsDynamic && bPart.match(/\$$/))

      if (aPartIsDynamic !== bPartIsDynamic) {
        return aPartIsDynamic ? 1 : -1
      }
      if (aPartIsOptional !== bPartIsOptional) {
        return aPartIsOptional ? 1 : -1
      }
    }
    if (aParts.length === bParts.length) return 0
    return aParts.length < bParts.length ? 1 : -1
  })
}
