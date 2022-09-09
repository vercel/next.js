import { isServerRuntime } from '../../server/config-shared'
import type { NextConfig } from '../../server/config-shared'
import type { Middleware, RouteHas } from '../../lib/load-custom-routes'
import {
  extractExportedConstValue,
  UnsupportedValueError,
} from './extract-const-value'
import { parseModule } from './parse-module'
import { promises as fs } from 'fs'
import { tryToParsePath } from '../../lib/try-to-parse-path'
import * as Log from '../output/log'
import { SERVER_RUNTIME } from '../../lib/constants'
import { ServerRuntime } from 'next/types'
import { checkCustomRoutes } from '../../lib/load-custom-routes'

export interface MiddlewareConfig {
  matchers: MiddlewareMatcher[]
}

export interface MiddlewareMatcher {
  regexp: string
  locale?: false
  has?: RouteHas[]
}

export interface PageStaticInfo {
  runtime?: ServerRuntime
  ssg?: boolean
  ssr?: boolean
  middleware?: Partial<MiddlewareConfig>
}

/**
 * Receives a parsed AST from SWC and checks if it belongs to a module that
 * requires a runtime to be specified. Those are:
 *   - Modules with `export function getStaticProps | getServerSideProps`
 *   - Modules with `export { getStaticProps | getServerSideProps } <from ...>`
 */
export function checkExports(swcAST: any): { ssr: boolean; ssg: boolean } {
  if (Array.isArray(swcAST?.body)) {
    try {
      for (const node of swcAST.body) {
        if (
          node.type === 'ExportDeclaration' &&
          node.declaration?.type === 'FunctionDeclaration' &&
          ['getStaticProps', 'getServerSideProps'].includes(
            node.declaration.identifier?.value
          )
        ) {
          return {
            ssg: node.declaration.identifier.value === 'getStaticProps',
            ssr: node.declaration.identifier.value === 'getServerSideProps',
          }
        }

        if (
          node.type === 'ExportDeclaration' &&
          node.declaration?.type === 'VariableDeclaration'
        ) {
          const id = node.declaration?.declarations[0]?.id.value
          if (['getStaticProps', 'getServerSideProps'].includes(id)) {
            return {
              ssg: id === 'getStaticProps',
              ssr: id === 'getServerSideProps',
            }
          }
        }

        if (node.type === 'ExportNamedDeclaration') {
          const values = node.specifiers.map(
            (specifier: any) =>
              specifier.type === 'ExportSpecifier' &&
              specifier.orig?.type === 'Identifier' &&
              specifier.orig?.value
          )

          return {
            ssg: values.some((value: any) =>
              ['getStaticProps'].includes(value)
            ),
            ssr: values.some((value: any) =>
              ['getServerSideProps'].includes(value)
            ),
          }
        }
      }
    } catch (err) {}
  }

  return { ssg: false, ssr: false }
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

function getMiddlewareMatchers(
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

  let routes = matchers.map(
    (m) => (typeof m === 'string' ? { source: m } : m) as Middleware
  )

  // check before we process the routes and after to ensure
  // they are still valid
  checkCustomRoutes(routes, 'middleware')

  routes = routes.map((r) => {
    let { source } = r

    const isRoot = source === '/'

    if (i18n?.locales && r.locale !== false) {
      source = `/:nextInternalLocale([^/.]{1,})${isRoot ? '' : source}`
    }

    source = `/:nextData(_next/data/[^/]{1,})?${source}${
      isRoot
        ? `(${nextConfig.i18n ? '|\\.json|' : ''}/?index|/?index\\.json)?`
        : '(.json)?'
    }`

    if (nextConfig.basePath) {
      source = `${nextConfig.basePath}${source}`
    }

    return { ...r, source }
  })

  checkCustomRoutes(routes, 'middleware')

  return routes.map((r) => {
    const { source, ...rest } = r
    const parsedPage = tryToParsePath(source)

    if (parsedPage.error || !parsedPage.regexStr) {
      throw new Error(`Invalid source: ${source}`)
    }

    return {
      ...rest,
      regexp: parsedPage.regexStr,
    }
  })
}

function getMiddlewareConfig(
  config: any,
  nextConfig: NextConfig
): Partial<MiddlewareConfig> {
  const result: Partial<MiddlewareConfig> = {}

  if (config.matcher) {
    result.matchers = getMiddlewareMatchers(config.matcher, nextConfig)
  }

  return result
}

let warnedAboutExperimentalEdgeApiFunctions = false
function warnAboutExperimentalEdgeApiFunctions() {
  if (warnedAboutExperimentalEdgeApiFunctions) {
    return
  }
  Log.warn(`You are using an experimental edge runtime, the API might change.`)
  warnedAboutExperimentalEdgeApiFunctions = true
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

/**
 * For a given pageFilePath and nextConfig, if the config supports it, this
 * function will read the file and return the runtime that should be used.
 * It will look into the file content only if the page *requires* a runtime
 * to be specified, that is, when gSSP or gSP is used.
 * Related discussion: https://github.com/vercel/next.js/discussions/34179
 */
export async function getPageStaticInfo(params: {
  nextConfig: Partial<NextConfig>
  pageFilePath: string
  isDev?: boolean
  page?: string
}): Promise<PageStaticInfo> {
  const { isDev, pageFilePath, nextConfig, page } = params

  const fileContent = (await tryToReadFile(pageFilePath, !isDev)) || ''
  if (/runtime|getStaticProps|getServerSideProps|matcher/.test(fileContent)) {
    const swcAST = await parseModule(pageFilePath, fileContent)
    const { ssg, ssr } = checkExports(swcAST)

    // default / failsafe value for config
    let config: any = {}
    try {
      config = extractExportedConstValue(swcAST, 'config')
    } catch (e) {
      if (e instanceof UnsupportedValueError) {
        warnAboutUnsupportedValue(pageFilePath, page, e)
      }
      // `export config` doesn't exist, or other unknown error throw by swc, silence them
    }

    if (
      typeof config.runtime !== 'undefined' &&
      !isServerRuntime(config.runtime)
    ) {
      const options = Object.values(SERVER_RUNTIME).join(', ')
      if (typeof config.runtime !== 'string') {
        Log.error(
          `The \`runtime\` config must be a string. Please leave it empty or choose one of: ${options}`
        )
      } else {
        Log.error(
          `Provided runtime "${config.runtime}" is not supported. Please leave it empty or choose one of: ${options}`
        )
      }
      if (!isDev) {
        process.exit(1)
      }
    }

    let runtime =
      SERVER_RUNTIME.edge === config?.runtime
        ? SERVER_RUNTIME.edge
        : ssr || ssg
        ? config?.runtime || nextConfig.experimental?.runtime
        : undefined

    if (runtime === SERVER_RUNTIME.edge) {
      warnAboutExperimentalEdgeApiFunctions()
    }

    const middlewareConfig = getMiddlewareConfig(config, nextConfig)

    return {
      ssr,
      ssg,
      ...(middlewareConfig && { middleware: middlewareConfig }),
      ...(runtime && { runtime }),
    }
  }

  return { ssr: false, ssg: false, runtime: nextConfig.experimental?.runtime }
}
