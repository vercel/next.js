import { isServerRuntime, ServerRuntime } from '../../server/config-shared'
import type { NextConfig } from '../../server/config-shared'
import {
  extractExportedConstValue,
  UnsupportedValueError,
} from './extract-const-value'
import { escapeStringRegexp } from '../../shared/lib/escape-regexp'
import { parseModule } from './parse-module'
import { promises as fs } from 'fs'
import { tryToParsePath } from '../../lib/try-to-parse-path'
import * as Log from '../output/log'
import { SERVER_RUNTIME } from '../../lib/constants'

interface MiddlewareConfig {
  pathMatcher: RegExp
}

export interface PageStaticInfo {
  runtime?: ServerRuntime
  ssg?: boolean
  ssr?: boolean
  middleware?: Partial<MiddlewareConfig>
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
      typeof config.runtime !== 'string' &&
      typeof config.runtime !== 'undefined'
    ) {
      throw new Error(`Provided runtime `)
    } else if (!isServerRuntime(config.runtime)) {
      const options = Object.values(SERVER_RUNTIME).join(', ')
      if (typeof config.runtime !== 'string') {
        throw new Error(
          `The \`runtime\` config must be a string. Please leave it empty or choose one of: ${options}`
        )
      } else {
        throw new Error(
          `Provided runtime "${config.runtime}" is not supported. Please leave it empty or choose one of: ${options}`
        )
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

  return { ssr: false, ssg: false }
}

/**
 * Receives a parsed AST from SWC and checks if it belongs to a module that
 * requires a runtime to be specified. Those are:
 *   - Modules with `export function getStaticProps | getServerSideProps`
 *   - Modules with `export { getStaticProps | getServerSideProps } <from ...>`
 */
function checkExports(swcAST: any) {
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

function getMiddlewareConfig(
  config: any,
  nextConfig: NextConfig
): Partial<MiddlewareConfig> {
  const result: Partial<MiddlewareConfig> = {}

  if (config.matcher) {
    result.pathMatcher = new RegExp(
      getMiddlewareRegExpStrings(config.matcher, nextConfig).join('|')
    )

    if (result.pathMatcher.source.length > 4096) {
      throw new Error(
        `generated matcher config must be less than 4096 characters.`
      )
    }
  }

  return result
}

function getMiddlewareRegExpStrings(
  matcherOrMatchers: unknown,
  nextConfig: NextConfig
): string[] {
  if (Array.isArray(matcherOrMatchers)) {
    return matcherOrMatchers.flatMap((matcher) =>
      getMiddlewareRegExpStrings(matcher, nextConfig)
    )
  }

  if (typeof matcherOrMatchers !== 'string') {
    throw new Error(
      '`matcher` must be a path matcher or an array of path matchers'
    )
  }

  let matcher: string = matcherOrMatchers

  if (!matcher.startsWith('/')) {
    throw new Error('`matcher`: path matcher must start with /')
  }

  if (nextConfig.i18n?.locales) {
    matcher = `/:nextInternalLocale(${nextConfig.i18n.locales
      .map((locale) => escapeStringRegexp(locale))
      .join('|')})${
      matcher === '/' && !nextConfig.trailingSlash ? '' : matcher
    }`
  }

  if (nextConfig.basePath) {
    matcher = `${nextConfig.basePath}${matcher === '/' ? '' : matcher}`
  }

  const parsedPage = tryToParsePath(matcher)
  if (parsedPage.error) {
    throw new Error(`Invalid path matcher: ${matcher}`)
  }

  const regexes = [parsedPage.regexStr].filter((x): x is string => !!x)
  if (regexes.length < 1) {
    throw new Error("Can't parse matcher")
  } else {
    return regexes
  }
}

function warnAboutExperimentalEdgeApiFunctions() {
  if (warnedAboutExperimentalEdgeApiFunctions) {
    return
  }
  Log.warn(`You are using an experimental edge runtime, the API might change.`)
  warnedAboutExperimentalEdgeApiFunctions = true
}

let warnedAboutExperimentalEdgeApiFunctions = false

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
