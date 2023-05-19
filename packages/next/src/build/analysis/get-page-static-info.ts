import type { NextConfig } from '../../server/config-shared'
import type { Middleware, RouteHas } from '../../lib/load-custom-routes'

import { promises as fs } from 'fs'
import LRUCache from 'next/dist/compiled/lru-cache'
import { matcher } from 'next/dist/compiled/micromatch'
import { ServerRuntime } from 'next/types'
import {
  extractExportedConstValue,
  UnsupportedValueError,
} from './extract-const-value'
import { parseModule } from './parse-module'
import * as Log from '../output/log'
import { SERVER_RUNTIME } from '../../lib/constants'
import { checkCustomRoutes } from '../../lib/load-custom-routes'
import { tryToParsePath } from '../../lib/try-to-parse-path'
import { isAPIRoute } from '../../lib/is-api-route'
import { isEdgeRuntime } from '../../lib/is-edge-runtime'
import { RSC_MODULE_TYPES } from '../../shared/lib/constants'
import type { RSCMeta } from '../webpack/loaders/get-module-build-info'

export interface MiddlewareConfig {
  matchers: MiddlewareMatcher[]
  unstable_allowDynamicGlobs: string[]
  regions: string[] | string
}

export interface MiddlewareMatcher {
  regexp: string
  locale?: false
  has?: RouteHas[]
  missing?: RouteHas[]
  originalSource: string
}

export interface PageStaticInfo {
  runtime?: ServerRuntime
  preferredRegion?: string | string[]
  ssg?: boolean
  ssr?: boolean
  rsc?: RSCModuleType
  middleware?: Partial<MiddlewareConfig>
}

const CLIENT_MODULE_LABEL =
  /\/\* __next_internal_client_entry_do_not_use__ ([^ ]*) (cjs|auto) \*\//
const ACTION_MODULE_LABEL =
  /\/\* __next_internal_action_entry_do_not_use__ ([^ ]+) \*\//

export type RSCModuleType = 'server' | 'client'
export function getRSCModuleInformation(
  source: string,
  isServerLayer = true
): RSCMeta {
  const actions = source.match(ACTION_MODULE_LABEL)?.[1]?.split(',')
  const clientInfoMatch = source.match(CLIENT_MODULE_LABEL)
  const isClientRef = !!clientInfoMatch

  if (!isServerLayer) {
    return {
      type: RSC_MODULE_TYPES.client,
      actions,
      isClientRef,
    }
  }

  const clientRefs = clientInfoMatch?.[1]?.split(',')
  const clientEntryType = clientInfoMatch?.[2] as 'cjs' | 'auto'

  const type = clientRefs ? RSC_MODULE_TYPES.client : RSC_MODULE_TYPES.server
  return { type, actions, clientRefs, clientEntryType, isClientRef }
}

/**
 * Receives a parsed AST from SWC and checks if it belongs to a module that
 * requires a runtime to be specified. Those are:
 *   - Modules with `export function getStaticProps | getServerSideProps`
 *   - Modules with `export { getStaticProps | getServerSideProps } <from ...>`
 *   - Modules with `export const runtime = ...`
 */
function checkExports(swcAST: any): {
  ssr: boolean
  ssg: boolean
  runtime?: string
  preferredRegion?: string | string[]
  generateImageMetadata?: boolean
  generateSitemaps?: boolean
} {
  const exportsSet = new Set<string>([
    'getStaticProps',
    'getServerSideProps',
    'generateImageMetadata',
    'generateSitemaps',
  ])
  if (Array.isArray(swcAST?.body)) {
    try {
      let runtime: string | undefined
      let preferredRegion: string | string[] | undefined
      let ssr: boolean = false
      let ssg: boolean = false
      let generateImageMetadata: boolean = false
      let generateSitemaps: boolean = false

      for (const node of swcAST.body) {
        if (
          node.type === 'ExportDeclaration' &&
          node.declaration?.type === 'VariableDeclaration'
        ) {
          for (const declaration of node.declaration?.declarations) {
            if (declaration.id.value === 'runtime') {
              runtime = declaration.init.value
            }

            if (declaration.id.value === 'preferredRegion') {
              if (declaration.init.type === 'ArrayExpression') {
                const elements: string[] = []
                for (const element of declaration.init.elements) {
                  const { expression } = element
                  if (expression.type !== 'StringLiteral') {
                    continue
                  }
                  elements.push(expression.value)
                }
                preferredRegion = elements
              } else {
                preferredRegion = declaration.init.value
              }
            }
          }
        }

        if (
          node.type === 'ExportDeclaration' &&
          node.declaration?.type === 'FunctionDeclaration' &&
          exportsSet.has(node.declaration.identifier?.value)
        ) {
          const id = node.declaration.identifier.value
          ssg = id === 'getStaticProps'
          ssr = id === 'getServerSideProps'
          generateImageMetadata = id === 'generateImageMetadata'
          generateSitemaps = id === 'generateSitemaps'
        }

        if (
          node.type === 'ExportDeclaration' &&
          node.declaration?.type === 'VariableDeclaration'
        ) {
          const id = node.declaration?.declarations[0]?.id.value
          if (exportsSet.has(id)) {
            ssg = id === 'getStaticProps'
            ssr = id === 'getServerSideProps'
            generateImageMetadata = id === 'generateImageMetadata'
            generateSitemaps = id === 'generateSitemaps'
          }
        }

        if (node.type === 'ExportNamedDeclaration') {
          const values = node.specifiers.map(
            (specifier: any) =>
              specifier.type === 'ExportSpecifier' &&
              specifier.orig?.type === 'Identifier' &&
              specifier.orig?.value
          )

          for (const value of values) {
            if (!ssg && value === 'getStaticProps') ssg = true
            if (!ssr && value === 'getServerSideProps') ssr = true
            if (!generateImageMetadata && value === 'generateImageMetadata')
              generateImageMetadata = true
            if (!generateSitemaps && value === 'generateSitemaps')
              generateSitemaps = true
          }
        }
      }

      return {
        ssr,
        ssg,
        runtime,
        preferredRegion,
        generateImageMetadata,
        generateSitemaps,
      }
    } catch (err) {}
  }

  return {
    ssg: false,
    ssr: false,
    runtime: undefined,
    preferredRegion: undefined,
    generateImageMetadata: false,
    generateSitemaps: false,
  }
}

async function tryToReadFile(filePath: string, shouldThrow: boolean) {
  try {
    return await fs.readFile(filePath, {
      encoding: 'utf8',
    })
  } catch (error) {
    if (shouldThrow) {
      throw error
    }
  }
}

export function getMiddlewareMatchers(
  matcherOrMatchers: unknown,
  nextConfig: NextConfig
): MiddlewareMatcher[] {
  let matchers: unknown[] = []
  if (Array.isArray(matcherOrMatchers)) {
    matchers = matcherOrMatchers
  } else {
    matchers.push(matcherOrMatchers)
  }
  const { i18n } = nextConfig

  const originalSourceMap = new Map<Middleware, string>()
  let routes = matchers.map((m) => {
    let middleware = (typeof m === 'string' ? { source: m } : m) as Middleware
    if (middleware) {
      originalSourceMap.set(middleware, middleware.source)
    }
    return middleware
  })

  // check before we process the routes and after to ensure
  // they are still valid
  checkCustomRoutes(routes, 'middleware')

  routes = routes.map((r) => {
    let { source } = r

    const isRoot = source === '/'

    if (i18n?.locales && r.locale !== false) {
      source = `/:nextInternalLocale((?!_next/)[^/.]{1,})${
        isRoot ? '' : source
      }`
    }

    source = `/:nextData(_next/data/[^/]{1,})?${source}${
      isRoot
        ? `(${nextConfig.i18n ? '|\\.json|' : ''}/?index|/?index\\.json)?`
        : '(.json)?'
    }`

    if (nextConfig.basePath) {
      source = `${nextConfig.basePath}${source}`
    }

    r.source = source
    return r
  })

  checkCustomRoutes(routes, 'middleware')

  return routes.map((r) => {
    const { source, ...rest } = r
    const parsedPage = tryToParsePath(source)

    if (parsedPage.error || !parsedPage.regexStr) {
      throw new Error(`Invalid source: ${source}`)
    }

    const originalSource = originalSourceMap.get(r)

    return {
      ...rest,
      regexp: parsedPage.regexStr,
      originalSource: originalSource || source,
    }
  })
}

function getMiddlewareConfig(
  pageFilePath: string,
  config: any,
  nextConfig: NextConfig
): Partial<MiddlewareConfig> {
  const result: Partial<MiddlewareConfig> = {}

  if (config.matcher) {
    result.matchers = getMiddlewareMatchers(config.matcher, nextConfig)
  }

  if (typeof config.regions === 'string' || Array.isArray(config.regions)) {
    result.regions = config.regions
  } else if (typeof config.regions !== 'undefined') {
    Log.warn(
      `The \`regions\` config was ignored: config must be empty, a string or an array of strings. (${pageFilePath})`
    )
  }

  if (config.unstable_allowDynamic) {
    result.unstable_allowDynamicGlobs = Array.isArray(
      config.unstable_allowDynamic
    )
      ? config.unstable_allowDynamic
      : [config.unstable_allowDynamic]
    for (const glob of result.unstable_allowDynamicGlobs ?? []) {
      try {
        matcher(glob)
      } catch (err) {
        throw new Error(
          `${pageFilePath} exported 'config.unstable_allowDynamic' contains invalid pattern '${glob}': ${
            (err as Error).message
          }`
        )
      }
    }
  }

  return result
}

const apiRouteWarnings = new LRUCache({ max: 250 })
function warnAboutExperimentalEdge(apiRoute: string | null) {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PRIVATE_BUILD_WORKER === '1'
  ) {
    return
  }
  if (apiRouteWarnings.has(apiRoute)) {
    return
  }
  Log.warn(
    apiRoute
      ? `${apiRoute} provided runtime 'experimental-edge'. It can be updated to 'edge' instead.`
      : `You are using an experimental edge runtime, the API might change.`
  )
  apiRouteWarnings.set(apiRoute, 1)
}

const warnedUnsupportedValueMap = new Map<string, boolean>()
function warnAboutUnsupportedValue(
  pageFilePath: string,
  page: string | undefined,
  error: UnsupportedValueError
) {
  if (warnedUnsupportedValueMap.has(pageFilePath)) {
    return
  }

  Log.warn(
    `Next.js can't recognize the exported \`config\` field in ` +
      (page ? `route "${page}"` : `"${pageFilePath}"`) +
      ':\n' +
      error.message +
      (error.path ? ` at "${error.path}"` : '') +
      '.\n' +
      'The default config will be used instead.\n' +
      'Read More - https://nextjs.org/docs/messages/invalid-page-config'
  )

  warnedUnsupportedValueMap.set(pageFilePath, true)
}

// Detect if metadata routes is a dynamic route, which containing
// generateImageMetadata or generateSitemaps as export
export async function isDynamicMetadataRoute(
  pageFilePath: string
): Promise<boolean> {
  const fileContent = (await tryToReadFile(pageFilePath, true)) || ''
  if (!/generateImageMetadata|generateSitemaps/.test(fileContent)) return false

  const swcAST = await parseModule(pageFilePath, fileContent)
  const exportsInfo = checkExports(swcAST)

  return !exportsInfo.generateImageMetadata || !exportsInfo.generateSitemaps
}

/**
 * For a given pageFilePath and nextConfig, if the config supports it, this
 * function will read the file and return the runtime that should be used.
 * It will look into the file content only if the page *requires* a runtime
 * to be specified, that is, when gSSP or gSP is used.
 * Related discussion: https://github.com/vercel/next.js/discussions/34179
 */
export async function getPageStaticInfo(params: {
  pageFilePath: string
  nextConfig: Partial<NextConfig>
  isDev?: boolean
  page?: string
  pageType: 'pages' | 'app' | 'root'
}): Promise<PageStaticInfo> {
  const { isDev, pageFilePath, nextConfig, page, pageType } = params

  const fileContent = (await tryToReadFile(pageFilePath, !isDev)) || ''
  if (
    /runtime|preferredRegion|getStaticProps|getServerSideProps|export const config/.test(
      fileContent
    )
  ) {
    const swcAST = await parseModule(pageFilePath, fileContent)
    const { ssg, ssr, runtime, preferredRegion } = checkExports(swcAST)
    const rsc = getRSCModuleInformation(fileContent).type

    // default / failsafe value for config
    let config: any
    try {
      config = extractExportedConstValue(swcAST, 'config')
    } catch (e) {
      if (e instanceof UnsupportedValueError) {
        warnAboutUnsupportedValue(pageFilePath, page, e)
      }
      // `export config` doesn't exist, or other unknown error throw by swc, silence them
    }
    if (pageType === 'app') {
      if (config) {
        const message = `\`export const config\` in ${pageFilePath} is deprecated. Please change \`runtime\` property to segment export config. See https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config`
        if (isDev) {
          Log.warnOnce(message)
        } else {
          throw new Error(message)
        }
        config = {}
      }
    }
    if (!config) config = {}

    // We use `export const config = { runtime: '...' }` to specify the page runtime for pages/.
    // In the new app directory, we prefer to use `export const runtime = '...'`
    // and deprecate the old way. To prevent breaking changes for `pages`, we use the exported config
    // as the fallback value.
    let resolvedRuntime
    if (pageType === 'app') {
      resolvedRuntime = runtime
    } else {
      resolvedRuntime = runtime || config.runtime
    }

    if (
      typeof resolvedRuntime !== 'undefined' &&
      resolvedRuntime !== SERVER_RUNTIME.nodejs &&
      !isEdgeRuntime(resolvedRuntime)
    ) {
      const options = Object.values(SERVER_RUNTIME).join(', ')
      const message =
        typeof resolvedRuntime !== 'string'
          ? `The \`runtime\` config must be a string. Please leave it empty or choose one of: ${options}`
          : `Provided runtime "${resolvedRuntime}" is not supported. Please leave it empty or choose one of: ${options}`
      if (isDev) {
        Log.error(message)
      } else {
        throw new Error(message)
      }
    }

    const requiresServerRuntime = ssr || ssg || pageType === 'app'

    const isAnAPIRoute = isAPIRoute(page?.replace(/^(?:\/src)?\/pages\//, '/'))

    resolvedRuntime =
      isEdgeRuntime(resolvedRuntime) || requiresServerRuntime
        ? resolvedRuntime
        : undefined

    if (resolvedRuntime === SERVER_RUNTIME.experimentalEdge) {
      warnAboutExperimentalEdge(isAnAPIRoute ? page! : null)
    }

    if (
      resolvedRuntime === SERVER_RUNTIME.edge &&
      pageType === 'pages' &&
      page &&
      !isAnAPIRoute
    ) {
      const message = `Page ${page} provided runtime 'edge', the edge runtime for rendering is currently experimental. Use runtime 'experimental-edge' instead.`
      if (isDev) {
        Log.error(message)
      } else {
        throw new Error(message)
      }
    }

    const middlewareConfig = getMiddlewareConfig(
      page ?? 'middleware/edge API route',
      config,
      nextConfig
    )

    return {
      ssr,
      ssg,
      rsc,
      ...(middlewareConfig && { middleware: middlewareConfig }),
      ...(resolvedRuntime && { runtime: resolvedRuntime }),
      preferredRegion,
    }
  }

  return {
    ssr: false,
    ssg: false,
    rsc: RSC_MODULE_TYPES.server,
    runtime: undefined,
  }
}
