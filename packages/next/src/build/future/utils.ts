import type PagesRouteModule from '../../server/future/route-modules/pages/module'
import type { EdgeFunctionDefinition } from '../webpack/plugins/middleware-plugin'

import { isValidElementType } from 'next/dist/compiled/react-is'
import {
  SSG_GET_INITIAL_PROPS_CONFLICT,
  SERVER_PROPS_GET_INIT_PROPS_CONFLICT,
  SERVER_PROPS_SSG_CONFLICT,
} from '../../lib/constants'
import { PAGES_MANIFEST } from '../../shared/lib/constants'
import {
  GetStaticPaths,
  GetStaticPathsResult,
  ServerRuntime,
} from '../../../types'
import { removeTrailingSlash } from '../../shared/lib/router/utils/remove-trailing-slash'
import { normalizeLocalePath } from '../../shared/lib/i18n/normalize-locale-path'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../../shared/lib/router/utils/route-matcher'
import escapePathDelimiters from '../../shared/lib/router/utils/escape-path-delimiters'
import * as Log from '../output/log'
import { isEdgeRuntime } from '../../lib/is-edge-runtime'
import { ManifestRouteModuleLoader } from '../../server/future/helpers/module-loader/manifest-module-loader'
import { EdgeModuleLoader } from '../../server/future/helpers/module-loader/edge-module-loader'

class InvalidGetStaticPathsError extends Error {
  constructor(message: string) {
    super(
      message +
        ` Expected: { paths: [], fallback: boolean }\n` +
        `See here for more info: https://nextjs.org/docs/messages/invalid-getstaticpaths-value`
    )
  }
}

class InvalidPathsKeyError extends Error {
  constructor(page: string) {
    super(
      `Invalid \`paths\` value returned from getStaticPaths in ${page}.\n` +
        `\`paths\` must be an array of strings or objects of shape { params: [key: string]: string }`
    )
  }
}

const VALID_GET_STATIC_PATHS_KEYS = ['paths', 'fallback']
const VALID_GET_STATIC_PATHS_PATH_KEYS = ['params', 'locale']

type GetStaticPathsParsedResult = {
  paths: string[]
  encodedPaths: string[]
  fallback: boolean | 'blocking' | undefined
}

function parseGetStaticPathsResult(
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

async function getStaticPaths(context: {
  page: string
  pageType: 'pages' | 'app'
  locales: string[] | undefined
  defaultLocale: string | undefined
  getStaticPaths: GetStaticPaths
  configFileName: string
}): Promise<GetStaticPathsParsedResult> {
  // Get the static paths for the page.
  const result = await context.getStaticPaths({})

  // Validate the output from getStaticPaths.
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new InvalidGetStaticPathsError(
      `Invalid value returned from getStaticPaths in ${
        context.page
      }. Received ${typeof result} `
    )
  }

  // Parse the result from getStaticPaths.
  return parseGetStaticPathsResult(result, context)
}

type IsPageStaticResult = {
  isStatic: boolean | undefined
  isAmpOnly: boolean | undefined
  isHybridAmp: boolean | undefined
  hasServerProps: boolean | undefined
  hasStaticProps: boolean | undefined
  prerenderRoutes: string[] | undefined
  encodedPrerenderRoutes: string[] | undefined
  prerenderFallback: boolean | 'blocking' | undefined
  isNextImageImported: boolean | undefined
  traceIncludes: string[] | undefined
  traceExcludes: string[] | undefined
}

export async function isPagesPageStatic(context: {
  page: string
  pageRuntime: ServerRuntime
  distDir: string
  locales: string[] | undefined
  defaultLocale: string | undefined
  configFileName: string
  getStaticPathsResult?: GetStaticPathsResult
  edgeInfo: EdgeFunctionDefinition | undefined
}): Promise<IsPageStaticResult> {
  let module: string | PagesRouteModule
  if (isEdgeRuntime(context.pageRuntime) && context.edgeInfo) {
    // Load the module from the edge runtime.
    module = await EdgeModuleLoader.load<PagesRouteModule>(
      context.distDir,
      context.edgeInfo
    )
  } else {
    // Try to load the module from the filesystem.
    module = await ManifestRouteModuleLoader.load<PagesRouteModule>(
      context.distDir,
      PAGES_MANIFEST,
      context.page
    )
  }

  if (typeof module === 'string') {
    throw new Error(
      'Invariant: unexpected string from loader.load during isPageStatic check'
    )
  }

  // Validate that the userland code contains the expected export.
  if (
    !module.userland.default ||
    !isValidElementType(module.userland.default) ||
    typeof module.userland.default === 'string'
  ) {
    // TODO: (wyattjoh) update this error to be more useful
    throw new Error('INVALID_DEFAULT_EXPORT')
  }

  // Validate that the userland code doesn't have any legacy exports.
  if ('unstable_getStaticParams' in module.userland) {
    throw new Error(
      `unstable_getStaticParams was replaced with getStaticPaths. Please update your code.`
    )
  }
  if ('unstable_getStaticPaths' in module.userland) {
    throw new Error(
      `unstable_getStaticPaths was replaced with getStaticPaths. Please update your code.`
    )
  }
  if ('unstable_getStaticProps' in module.userland) {
    throw new Error(
      `unstable_getStaticProps was replaced with getStaticProps. Please update your code.`
    )
  }
  if ('unstable_getServerProps' in module.userland) {
    throw new Error(
      `unstable_getServerProps was replaced with getServerSideProps. Please update your code.`
    )
  }

  // Validate that the page doesn't have both getStaticProps and
  // getInitialProps.
  if (
    module.userland.getStaticProps &&
    module.userland.default.getInitialProps
  ) {
    throw new Error(SSG_GET_INITIAL_PROPS_CONFLICT)
  }

  // Validate that the page doesn't have both getServerSideProps and
  // getInitialProps.
  if (
    module.userland.getServerSideProps &&
    module.userland.default.getInitialProps
  ) {
    throw new Error(SERVER_PROPS_GET_INIT_PROPS_CONFLICT)
  }

  // Validate that the page doesn't have both getStaticProps and
  // getServerSideProps.
  if (module.userland.getStaticProps && module.userland.getServerSideProps) {
    throw new Error(SERVER_PROPS_SSG_CONFLICT)
  }

  // A page must have getStaticPaths if it's dynamic and has getStaticProps.
  if (
    module.isDynamic &&
    module.userland.getStaticProps &&
    !module.userland.getStaticPaths
  ) {
    throw new Error(
      `getStaticPaths is required for dynamic SSG pages and is missing for '${context.page}'.` +
        `\nRead more: https://nextjs.org/docs/messages/invalid-getstaticpaths-value`
    )
  }

  // A page can't have getStaticProps and getStaticPaths if it's not dynamic.
  if (
    module.userland.getStaticProps &&
    module.userland.getStaticPaths &&
    !module.isDynamic
  ) {
    throw new Error(
      `getStaticPaths can only be used with dynamic pages, not '${context.page}'.` +
        `\nLearn more: https://nextjs.org/docs/routing/dynamic-routes`
    )
  }

  // Build the static paths if getStaticPaths is defined.
  let parsed: GetStaticPathsParsedResult | undefined
  if (context.getStaticPathsResult) {
    parsed = parseGetStaticPathsResult(context.getStaticPathsResult, {
      page: context.page,
      pageType: 'pages',
      locales: context.locales,
      defaultLocale: context.defaultLocale,
      configFileName: context.configFileName,
    })
  } else if (module.userland.getStaticPaths) {
    parsed = await getStaticPaths({
      page: context.page,
      pageType: 'pages',
      locales: context.locales,
      defaultLocale: context.defaultLocale,
      configFileName: context.configFileName,
      getStaticPaths: module.userland.getStaticPaths,
    })
  }

  const isNextImageImported = (globalThis as any).__NEXT_IMAGE_IMPORTED
  if (
    module.userland.config?.unstable_includeFiles ||
    module.userland.config?.unstable_excludeFiles
  ) {
    Log.warn(
      `unstable_includeFiles/unstable_excludeFiles has been removed in favor of the option in next.config.js.\nSee more info here: https://nextjs.org/docs/advanced-features/output-file-tracing#caveats`
    )
  }

  return {
    isStatic:
      typeof module.userland.getStaticProps !== 'function' &&
      typeof module.userland.default.getInitialProps !== 'function' &&
      typeof module.userland.getServerSideProps !== 'function',
    isHybridAmp: module.userland.config?.amp === 'hybrid',
    isAmpOnly: module.userland.config?.amp === true,
    prerenderRoutes: parsed?.paths,
    prerenderFallback: parsed?.fallback,
    encodedPrerenderRoutes: parsed?.encodedPaths,
    hasStaticProps: typeof module.userland.getStaticProps === 'function',
    hasServerProps: typeof module.userland.getServerSideProps === 'function',
    isNextImageImported,
    // TODO: (wyattjoh) find out where these are included
    traceIncludes: undefined,
    traceExcludes: undefined,
  }
}
