import { ParsedUrlQuery } from 'querystring'
import { getRouteRegex, getRouteMatcher } from '../next-server/lib/router/utils'
import { Unstable_getStaticPaths } from '../next-server/server/load-components'

export async function getPrerenderPaths(
  page: string,
  unstable_getStaticPaths: Unstable_getStaticPaths
) {
  const prerenderPaths = [] as string[]

  const _routeRegex = getRouteRegex(page)
  const _routeMatcher = getRouteMatcher(_routeRegex)

  // Get the default list of allowed params.
  const _validParamKeys = Object.keys(_routeMatcher(page))
  const toPrerender = await unstable_getStaticPaths()

  toPrerender.forEach(entry => {
    // For a string-provided path, we must make sure it matches the dynamic
    // route.
    if (typeof entry === 'string') {
      const result = _routeMatcher(entry)
      if (!result) {
        throw new Error(
          `The provided path \`${entry}\` does not match the page: \`${page}\`.`
        )
      }

      prerenderPaths!.push(entry)
    }
    // For the object-provided path, we must make sure it specifies all
    // required keys.
    else {
      const invalidKeys = Object.keys(entry).filter(key => key !== 'params')
      if (invalidKeys.length) {
        throw new Error(
          `Additional keys were returned from \`unstable_getStaticPaths\` in page "${page}". ` +
            `URL Parameters intended for this dynamic route must be nested under the \`params\` key, i.e.:` +
            `\n\n\treturn { params: { ${_validParamKeys
              .map(k => `${k}: ...`)
              .join(', ')} } }` +
            `\n\nKeys that need to be moved: ${invalidKeys.join(', ')}.\n`
        )
      }

      const { params = {} }: { params?: ParsedUrlQuery } = entry
      let builtPage = page

      _validParamKeys.forEach(validParamKey => {
        const { repeat } = _routeRegex.groups[validParamKey]
        const paramValue = params[validParamKey]
        if (
          (repeat && !Array.isArray(paramValue)) ||
          (!repeat && typeof paramValue !== 'string')
        ) {
          throw new Error(
            `A required parameter (${validParamKey}) was not provided as ${
              repeat ? 'an array' : 'a string'
            }.`
          )
        }

        builtPage = builtPage.replace(
          `[${repeat ? '...' : ''}${validParamKey}]`,
          repeat
            ? (paramValue as string[]).map(encodeURIComponent).join('/')
            : encodeURIComponent(paramValue as string)
        )
      })

      prerenderPaths!.push(builtPage)
    }
  })

  return prerenderPaths
}
