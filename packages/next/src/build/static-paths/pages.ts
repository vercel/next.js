import type { GetStaticPaths, GetStaticPathsResult } from '../../types'
import type { PrerenderedRoute, StaticPathsResult } from './types'

import { normalizeLocalePath } from '../../shared/lib/i18n/normalize-locale-path'
import { parseStaticPathsResult } from '../../lib/fallback'
import escapePathDelimiters from '../../shared/lib/router/utils/escape-path-delimiters'
import { removeTrailingSlash } from '../../shared/lib/router/utils/remove-trailing-slash'
import { getRouteMatcher } from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'

export async function buildStaticPaths({
  page,
  getStaticPaths,
  staticPathsResult,
  configFileName,
  locales,
  defaultLocale,
  appDir,
}: {
  page: string
  getStaticPaths?: GetStaticPaths
  staticPathsResult?: GetStaticPathsResult
  configFileName: string
  locales?: string[]
  defaultLocale?: string
  appDir?: boolean
}): Promise<StaticPathsResult> {
  const prerenderedRoutes: PrerenderedRoute[] = []
  const _routeRegex = getRouteRegex(page)
  const _routeMatcher = getRouteMatcher(_routeRegex)

  // Get the default list of allowed params.
  const routeParameterKeys = Object.keys(_routeMatcher(page))

  if (!staticPathsResult) {
    if (getStaticPaths) {
      staticPathsResult = await getStaticPaths({ locales, defaultLocale })
    } else {
      throw new Error(
        `invariant: attempted to buildStaticPaths without "staticPathsResult" or "getStaticPaths" ${page}`
      )
    }
  }

  const expectedReturnVal =
    `Expected: { paths: [], fallback: boolean }\n` +
    `See here for more info: https://nextjs.org/docs/messages/invalid-getstaticpaths-value`

  if (
    !staticPathsResult ||
    typeof staticPathsResult !== 'object' ||
    Array.isArray(staticPathsResult)
  ) {
    throw new Error(
      `Invalid value returned from getStaticPaths in ${page}. Received ${typeof staticPathsResult} ${expectedReturnVal}`
    )
  }

  const invalidStaticPathKeys = Object.keys(staticPathsResult).filter(
    (key) => !(key === 'paths' || key === 'fallback')
  )

  if (invalidStaticPathKeys.length > 0) {
    throw new Error(
      `Extra keys returned from getStaticPaths in ${page} (${invalidStaticPathKeys.join(
        ', '
      )}) ${expectedReturnVal}`
    )
  }

  if (
    !(
      typeof staticPathsResult.fallback === 'boolean' ||
      staticPathsResult.fallback === 'blocking'
    )
  ) {
    throw new Error(
      `The \`fallback\` key must be returned from getStaticPaths in ${page}.\n` +
        expectedReturnVal
    )
  }

  const toPrerender = staticPathsResult.paths

  if (!Array.isArray(toPrerender)) {
    throw new Error(
      `Invalid \`paths\` value returned from getStaticPaths in ${page}.\n` +
        `\`paths\` must be an array of strings or objects of shape { params: [key: string]: string }`
    )
  }

  toPrerender.forEach((entry) => {
    // For a string-provided path, we must make sure it matches the dynamic
    // route.
    if (typeof entry === 'string') {
      entry = removeTrailingSlash(entry)

      const localePathResult = normalizeLocalePath(entry, locales)
      let cleanedEntry = entry

      if (localePathResult.detectedLocale) {
        cleanedEntry = entry.slice(localePathResult.detectedLocale.length + 1)
      } else if (defaultLocale) {
        entry = `/${defaultLocale}${entry}`
      }

      const result = _routeMatcher(cleanedEntry)
      if (!result) {
        throw new Error(
          `The provided path \`${cleanedEntry}\` does not match the page: \`${page}\`.`
        )
      }

      // If leveraging the string paths variant the entry should already be
      // encoded so we decode the segments ensuring we only escape path
      // delimiters
      prerenderedRoutes.push({
        path: entry
          .split('/')
          .map((segment) =>
            escapePathDelimiters(decodeURIComponent(segment), true)
          )
          .join('/'),
        encoded: entry,
        fallbackRouteParams: undefined,
      })
    }
    // For the object-provided path, we must make sure it specifies all
    // required keys.
    else {
      const invalidKeys = Object.keys(entry).filter(
        (key) => key !== 'params' && key !== 'locale'
      )

      if (invalidKeys.length) {
        throw new Error(
          `Additional keys were returned from \`getStaticPaths\` in page "${page}". ` +
            `URL Parameters intended for this dynamic route must be nested under the \`params\` key, i.e.:` +
            `\n\n\treturn { params: { ${routeParameterKeys
              .map((k) => `${k}: ...`)
              .join(', ')} } }` +
            `\n\nKeys that need to be moved: ${invalidKeys.join(', ')}.\n`
        )
      }

      const { params = {} } = entry
      let builtPage = page
      let encodedBuiltPage = page

      routeParameterKeys.forEach((validParamKey) => {
        const { repeat, optional } = _routeRegex.groups[validParamKey]
        let paramValue = params[validParamKey]
        if (
          optional &&
          params.hasOwnProperty(validParamKey) &&
          (paramValue === null ||
            paramValue === undefined ||
            (paramValue as any) === false)
        ) {
          paramValue = []
        }
        if (
          (repeat && !Array.isArray(paramValue)) ||
          (!repeat && typeof paramValue !== 'string')
        ) {
          // If this is from app directory, and not all params were provided,
          // then filter this out.
          if (appDir && typeof paramValue === 'undefined') {
            builtPage = ''
            encodedBuiltPage = ''
            return
          }

          throw new Error(
            `A required parameter (${validParamKey}) was not provided as ${
              repeat ? 'an array' : 'a string'
            } received ${typeof paramValue} in ${
              appDir ? 'generateStaticParams' : 'getStaticPaths'
            } for ${page}`
          )
        }
        let replaced = `[${repeat ? '...' : ''}${validParamKey}]`
        if (optional) {
          replaced = `[${replaced}]`
        }
        builtPage = builtPage
          .replace(
            replaced,
            repeat
              ? (paramValue as string[])
                  .map((segment) => escapePathDelimiters(segment, true))
                  .join('/')
              : escapePathDelimiters(paramValue as string, true)
          )
          .replace(/\\/g, '/')
          .replace(/(?!^)\/$/, '')

        encodedBuiltPage = encodedBuiltPage
          .replace(
            replaced,
            repeat
              ? (paramValue as string[]).map(encodeURIComponent).join('/')
              : encodeURIComponent(paramValue as string)
          )
          .replace(/\\/g, '/')
          .replace(/(?!^)\/$/, '')
      })

      if (!builtPage && !encodedBuiltPage) {
        return
      }

      if (entry.locale && !locales?.includes(entry.locale)) {
        throw new Error(
          `Invalid locale returned from getStaticPaths for ${page}, the locale ${entry.locale} is not specified in ${configFileName}`
        )
      }
      const curLocale = entry.locale || defaultLocale || ''

      prerenderedRoutes.push({
        path: `${curLocale ? `/${curLocale}` : ''}${
          curLocale && builtPage === '/' ? '' : builtPage
        }`,
        encoded: `${curLocale ? `/${curLocale}` : ''}${
          curLocale && encodedBuiltPage === '/' ? '' : encodedBuiltPage
        }`,
        fallbackRouteParams: undefined,
      })
    }
  })

  const seen = new Set<string>()

  return {
    fallbackMode: parseStaticPathsResult(staticPathsResult.fallback),
    prerenderedRoutes: prerenderedRoutes.filter((route) => {
      if (seen.has(route.path)) return false

      // Filter out duplicate paths.
      seen.add(route.path)
      return true
    }),
  }
}
