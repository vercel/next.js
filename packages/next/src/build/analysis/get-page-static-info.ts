import type { NextConfig } from '../../server/config-shared'
import type { Middleware, RouteHas } from '../../lib/load-custom-routes'

import { promises as fs } from 'fs'
import LRUCache from 'next/dist/compiled/lru-cache'
import picomatch from 'next/dist/compiled/picomatch'
import type { ServerRuntime } from 'next/types'
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
import { PAGE_TYPES } from '../../lib/page-types'

// TODO: migrate preferredRegion here
// Don't forget to update the next-types-plugin file as well
const AUTHORIZED_EXTRA_ROUTER_PROPS = ['maxDuration']

export interface MiddlewareConfig {
  matchers?: MiddlewareMatcher[]
  unstable_allowDynamicGlobs?: string[]
  regions?: string[] | string
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
  generateStaticParams?: boolean
  middleware?: MiddlewareConfig
  amp?: boolean | 'hybrid'
  extraConfig?: Record<string, any>
}

const CLIENT_MODULE_LABEL =
  /\/\* __next_internal_client_entry_do_not_use__ ([^ ]*) (cjs|auto) \*\//

const ACTION_MODULE_LABEL =
  /\/\* __next_internal_action_entry_do_not_use__ (\{[^}]+\}) \*\//

const CLIENT_DIRECTIVE = 'use client'
const SERVER_ACTION_DIRECTIVE = 'use server'

export type RSCModuleType = 'server' | 'client'
export function getRSCModuleInformation(
  source: string,
  isReactServerLayer: boolean
): RSCMeta {
  const actionsJson = source.match(ACTION_MODULE_LABEL)
  const actions = actionsJson
    ? (Object.values(JSON.parse(actionsJson[1])) as string[])
    : undefined
  const clientInfoMatch = source.match(CLIENT_MODULE_LABEL)
  const isClientRef = !!clientInfoMatch

  if (!isReactServerLayer) {
    return {
      type: RSC_MODULE_TYPES.client,
      actions,
      isClientRef,
    }
  }

  const clientRefs = clientInfoMatch?.[1]?.split(',')
  const clientEntryType = clientInfoMatch?.[2] as 'cjs' | 'auto'

  const type = clientRefs ? RSC_MODULE_TYPES.client : RSC_MODULE_TYPES.server

  return {
    type,
    actions,
    clientRefs,
    clientEntryType,
    isClientRef,
  }
}

const warnedInvalidValueMap = {
  runtime: new Map<string, boolean>(),
  preferredRegion: new Map<string, boolean>(),
} as const
function warnInvalidValue(
  pageFilePath: string,
  key: keyof typeof warnedInvalidValueMap,
  message: string
): void {
  if (warnedInvalidValueMap[key].has(pageFilePath)) return

  Log.warn(
    `Next.js can't recognize the exported \`${key}\` field in "${pageFilePath}" as ${message}.` +
      '\n' +
      'The default runtime will be used instead.'
  )

  warnedInvalidValueMap[key].set(pageFilePath, true)
}
/**
 * Receives a parsed AST from SWC and checks if it belongs to a module that
 * requires a runtime to be specified. Those are:
 *   - Modules with `export function getStaticProps | getServerSideProps`
 *   - Modules with `export { getStaticProps | getServerSideProps } <from ...>`
 *   - Modules with `export const runtime = ...`
 */
function checkExports(
  swcAST: any,
  pageFilePath: string
): {
  ssr: boolean
  ssg: boolean
  runtime?: string
  preferredRegion?: string | string[]
  generateImageMetadata?: boolean
  generateSitemaps?: boolean
  generateStaticParams: boolean
  extraProperties?: Set<string>
  directives?: Set<string>
} {
  const exportsSet = new Set<string>([
    'getStaticProps',
    'getServerSideProps',
    'generateImageMetadata',
    'generateSitemaps',
    'generateStaticParams',
  ])
  if (Array.isArray(swcAST?.body)) {
    try {
      let runtime: string | undefined
      let preferredRegion: string | string[] | undefined
      let ssr: boolean = false
      let ssg: boolean = false
      let generateImageMetadata: boolean = false
      let generateSitemaps: boolean = false
      let generateStaticParams = false
      let extraProperties = new Set<string>()
      let directives = new Set<string>()
      let hasLeadingNonDirectiveNode = false

      for (const node of swcAST.body) {
        // There should be no non-string literals nodes before directives
        if (
          node.type === 'ExpressionStatement' &&
          node.expression.type === 'StringLiteral'
        ) {
          if (!hasLeadingNonDirectiveNode) {
            const directive = node.expression.value
            if (CLIENT_DIRECTIVE === directive) {
              directives.add('client')
            }
            if (SERVER_ACTION_DIRECTIVE === directive) {
              directives.add('server')
            }
          }
        } else {
          hasLeadingNonDirectiveNode = true
        }
        if (
          node.type === 'ExportDeclaration' &&
          node.declaration?.type === 'VariableDeclaration'
        ) {
          for (const declaration of node.declaration?.declarations) {
            if (declaration.id.value === 'runtime') {
              runtime = declaration.init.value
            } else if (declaration.id.value === 'preferredRegion') {
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
            } else {
              extraProperties.add(declaration.id.value)
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
          generateStaticParams = id === 'generateStaticParams'
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
            generateStaticParams = id === 'generateStaticParams'
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
            if (!generateStaticParams && value === 'generateStaticParams')
              generateStaticParams = true
            if (!runtime && value === 'runtime')
              warnInvalidValue(
                pageFilePath,
                'runtime',
                'it was not assigned to a string literal'
              )
            if (!preferredRegion && value === 'preferredRegion')
              warnInvalidValue(
                pageFilePath,
                'preferredRegion',
                'it was not assigned to a string literal or an array of string literals'
              )
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
        generateStaticParams,
        extraProperties,
        directives,
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
    generateStaticParams: false,
    extraProperties: undefined,
    directives: undefined,
  }
}

async function tryToReadFile(filePath: string, shouldThrow: boolean) {
  try {
    return await fs.readFile(filePath, {
      encoding: 'utf8',
    })
  } catch (error: any) {
    if (shouldThrow) {
      error.message = `Next.js ERROR: Failed to read file ${filePath}:\n${error.message}`
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
        picomatch(glob)
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

const warnedUnsupportedValueMap = new LRUCache<string, boolean>({ max: 250 })

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
  if (/generateImageMetadata|generateSitemaps/.test(fileContent)) {
    const swcAST = await parseModule(pageFilePath, fileContent)
    const exportsInfo = checkExports(swcAST, pageFilePath)
    return !!(exportsInfo.generateImageMetadata || exportsInfo.generateSitemaps)
  }
  return false
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
  pageType: PAGE_TYPES
}): Promise<PageStaticInfo> {
  const { isDev, pageFilePath, nextConfig, page, pageType } = params

  const fileContent = (await tryToReadFile(pageFilePath, !isDev)) || ''
  if (
    /(?<!(_jsx|jsx-))runtime|preferredRegion|getStaticProps|getServerSideProps|generateStaticParams|export const/.test(
      fileContent
    )
  ) {
    const swcAST = await parseModule(pageFilePath, fileContent)
    const {
      ssg,
      ssr,
      runtime,
      preferredRegion,
      generateStaticParams,
      extraProperties,
      directives,
    } = checkExports(swcAST, pageFilePath)
    const rscInfo = getRSCModuleInformation(fileContent, true)
    const rsc = rscInfo.type

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

    const extraConfig: Record<string, any> = {}

    if (extraProperties && pageType === PAGE_TYPES.APP) {
      for (const prop of extraProperties) {
        if (!AUTHORIZED_EXTRA_ROUTER_PROPS.includes(prop)) continue
        try {
          extraConfig[prop] = extractExportedConstValue(swcAST, prop)
        } catch (e) {
          if (e instanceof UnsupportedValueError) {
            warnAboutUnsupportedValue(pageFilePath, page, e)
          }
        }
      }
    } else if (pageType === PAGE_TYPES.PAGES) {
      for (const key in config) {
        if (!AUTHORIZED_EXTRA_ROUTER_PROPS.includes(key)) continue
        extraConfig[key] = config[key]
      }
    }

    if (pageType === PAGE_TYPES.APP) {
      if (config) {
        let message = `Page config in ${pageFilePath} is deprecated. Replace \`export const config=…\` with the following:`

        if (config.runtime) {
          message += `\n  - \`export const runtime = ${JSON.stringify(
            config.runtime
          )}\``
        }

        if (config.regions) {
          message += `\n  - \`export const preferredRegion = ${JSON.stringify(
            config.regions
          )}\``
        }

        message += `\nVisit https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config for more information.`

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
    if (pageType === PAGE_TYPES.APP) {
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

    const requiresServerRuntime = ssr || ssg || pageType === PAGE_TYPES.APP

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
      pageType === PAGE_TYPES.PAGES &&
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

    if (
      pageType === PAGE_TYPES.APP &&
      directives?.has('client') &&
      generateStaticParams
    ) {
      throw new Error(
        `Page "${page}" cannot use both "use client" and export function "generateStaticParams()".`
      )
    }

    return {
      ssr,
      ssg,
      rsc,
      generateStaticParams,
      amp: config.amp || false,
      ...(middlewareConfig && { middleware: middlewareConfig }),
      ...(resolvedRuntime && { runtime: resolvedRuntime }),
      preferredRegion,
      extraConfig,
    }
  }

  return {
    ssr: false,
    ssg: false,
    rsc: RSC_MODULE_TYPES.server,
    generateStaticParams: false,
    amp: false,
    runtime: undefined,
  }
}
