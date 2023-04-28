import { GetStaticPathsResult } from '../../../../../types'
import { removeTrailingSlash } from '../../../../shared/lib/router/utils/remove-trailing-slash'
import { normalizeLocalePath } from '../../../../shared/lib/i18n/normalize-locale-path'
import { getRouteRegex } from '../../../../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../../../../shared/lib/router/utils/route-matcher'
import escapePathDelimiters from '../../../../shared/lib/router/utils/escape-path-delimiters'
import {
  VALID_GET_STATIC_PATHS_KEYS,
  InvalidGetStaticPathsError,
  InvalidPathsKeyError,
  VALID_GET_STATIC_PATHS_PATH_KEYS,
} from '../pages'

export type GetStaticPathsParsedResult = {
  paths: string[]
  encodedPaths: string[]
  fallback: boolean | 'blocking' | undefined
}

function parseStaticPaths(
  result: GetStaticPathsResult,
  context: {
    page: string
    pageType: 'pages' | 'app'
    locales: string[] | undefined
    defaultLocale: string | undefined
    configFileName: string
  }
): GetStaticPathsParsedResult {
  // Check for any extra or invalid keys.
  let invalidKeys = Object.keys(result).filter(
    (key) => !VALID_GET_STATIC_PATHS_KEYS.includes(key)
  )
  if (invalidKeys.length > 0) {
    throw new InvalidGetStaticPathsError(
      `Extra keys returned from getStaticPaths in ${
        context.page
      } (${invalidKeys.join(', ')})`
    )
  }

  // Check that the keys we got are valid.
  if (typeof result.fallback !== 'boolean' && result.fallback !== 'blocking') {
    throw new InvalidGetStaticPathsError(
      `The \`fallback\` key must be returned from getStaticPaths in ${context.page}.`
    )
  }

  // Validate that the `paths` key is valid.
  const paths = result.paths
  if (!Array.isArray(paths)) {
    throw new InvalidPathsKeyError(context.page)
  }

  const routeRegex = getRouteRegex(context.page)
  const routeMatcher = getRouteMatcher(routeRegex)
  const keys = Object.keys(routeMatcher(context.page))

  const prerenderPaths = new Set<string>()
  const encodedPrerenderPaths = new Set<string>()

  // Check and validate each path.
  for (let entry of paths) {
    if (typeof entry === 'string') {
      entry = removeTrailingSlash(entry)

      const locale = normalizeLocalePath(entry, context.locales)
      let cleanedEntry = entry

      if (locale.detectedLocale) {
        cleanedEntry = locale.pathname
      } else if (context.defaultLocale) {
        entry = `/${context.defaultLocale}${entry}`
      }

      if (!routeMatcher(cleanedEntry)) {
        throw new Error(
          `Invariant: The provided path \`${cleanedEntry}\` does not match the page: \`${context.page}\`.`
        )
      }

      // If leveraging the string paths variant the entry should already be
      // encoded so we decode the segments ensuring we only escape path
      // delimiters
      prerenderPaths.add(
        entry
          .split('/')
          .map((segment) =>
            escapePathDelimiters(decodeURIComponent(segment), true)
          )
          .join('/')
      )
      encodedPrerenderPaths.add(entry)
    } else {
      // For the object-provided path, we must make sure it specifies all
      // required keys.
      invalidKeys = Object.keys(entry).filter(
        (key) => !VALID_GET_STATIC_PATHS_PATH_KEYS.includes(key)
      )
      if (invalidKeys.length) {
        throw new Error(
          `Additional keys were returned from \`getStaticPaths\` in page "${context.page}". ` +
            `URL Parameters intended for this dynamic route must be nested under the \`params\` key, i.e.:` +
            `\n\n\treturn { params: { ${keys
              .map((k) => `${k}: ...`)
              .join(', ')} } }` +
            `\n\nKeys that need to be moved: ${invalidKeys.join(', ')}.\n`
        )
      }

      const { params = {} } = entry
      let builtPage = context.page
      let encodedBuiltPage = context.page

      for (const key of keys) {
        let value = params[key]
        const { repeat, optional } = routeRegex.groups[key]

        // For optional parameters, we validate that the key is correct
        // otherwise we set it to an empty array.
        if (
          optional &&
          params.hasOwnProperty(key) &&
          (value === null ||
            typeof value === 'undefined' ||
            (value as any) === false)
        ) {
          value = []
        }

        // Validate the repeating parameters.
        if (
          (repeat && !Array.isArray(value)) ||
          (!repeat && typeof value !== 'string')
        ) {
          // If from appDir and not all params were provided from
          // generateStaticParams we can just filter this entry out
          // as it's meant to be generated at runtime
          if (context.pageType === 'app' && typeof value === 'undefined') {
            // Reset the built page and encoded built page.
            builtPage = ''
            encodedBuiltPage = ''

            // Skip processing this entry.
            break
          }

          throw new Error(
            `A required parameter (${key}) was not provided as ${
              repeat ? 'an array' : 'a string'
            } received ${typeof value} in ${
              context.pageType === 'app'
                ? 'generateStaticParams'
                : 'getStaticPaths'
            } for ${context.page}`
          )
        }

        if (!value) {
          throw new Error(
            `A required parameter (${key}) was not provided as ${
              repeat ? 'an array' : 'a string'
            } received ${typeof value} in ${
              context.pageType === 'app'
                ? 'generateStaticParams'
                : 'getStaticPaths'
            } for ${context.page}`
          )
        }

        // Convert the key name into the pathname segment.
        let replaced = repeat ? `[...${key}]` : `[${key}]`
        if (optional) replaced = `[${replaced}]`

        // Try to replace the placeholder character with the encoded value.
        builtPage = removeTrailingSlash(
          builtPage.replace(
            replaced,
            Array.isArray(value)
              ? value
                  .map((segment) => escapePathDelimiters(segment, true))
                  .join('/')
              : escapePathDelimiters(value, true)
          )
        )
        encodedBuiltPage = removeTrailingSlash(
          encodedBuiltPage.replace(
            replaced,
            Array.isArray(value)
              ? value.map(encodeURIComponent).join('/')
              : encodeURIComponent(value)
          )
        )
      }

      // If we ended up without a built page, we can skip this entry.
      if (!builtPage && !encodedBuiltPage) continue

      if (entry.locale && !context.locales?.includes(entry.locale)) {
        throw new Error(
          `Invalid locale returned from getStaticPaths for ${context.page}, the locale ${entry.locale} is not specified in ${context.configFileName}`
        )
      }

      // Add the locale to the built page.
      const locale = entry.locale || context.defaultLocale
      if (locale) {
        if (builtPage === '/') {
          builtPage = `/${locale}`
          encodedBuiltPage = `/${locale}`
        } else {
          builtPage = `/${locale}${builtPage}`
          encodedBuiltPage = `/${locale}${encodedBuiltPage}`
        }
      }

      prerenderPaths.add(builtPage)
      encodedPrerenderPaths.add(encodedBuiltPage)
    }
  }

  return {
    paths: Array.from(prerenderPaths),
    encodedPaths: Array.from(encodedPrerenderPaths),
    fallback: result.fallback,
  }
}

export function parseGetStaticPathsResult(
  result: GetStaticPathsResult,
  context: {
    page: string
    locales: string[] | undefined
    defaultLocale: string | undefined
    configFileName: string
  }
) {
  return parseStaticPaths(result, { ...context, pageType: 'pages' })
}

export function parseGenerateStaticParamsResult(
  result: GetStaticPathsResult,
  context: {
    page: string
    configFileName: string
  }
) {
  return parseStaticPaths(result, {
    ...context,
    locales: undefined,
    defaultLocale: undefined,
    pageType: 'app',
  })
}
