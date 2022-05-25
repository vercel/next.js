import type { PageRuntime } from '../../server/config-shared'
import type { NextConfig } from '../../server/config-shared'
import { tryToExtractExportedConstValue } from './extract-const-value'
import { parseModule } from './parse-module'
import { promises as fs } from 'fs'
import { tryToParsePath } from '../../lib/try-to-parse-path'
import { MIDDLEWARE_FILE } from '../../lib/constants'

interface MiddlewareConfig {
  pathMatcher: RegExp
}

export interface PageStaticInfo {
  runtime?: PageRuntime
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
  const { isDev, pageFilePath, nextConfig } = params

  const fileContent = (await tryToReadFile(pageFilePath, !isDev)) || ''
  if (/runtime|getStaticProps|getServerSideProps|matching/.test(fileContent)) {
    const swcAST = await parseModule(pageFilePath, fileContent)
    const { ssg, ssr } = checkExports(swcAST)
    const config = tryToExtractExportedConstValue(swcAST, 'config') || {}
    const runtime =
      config?.runtime === 'edge'
        ? 'edge'
        : // For Node.js runtime, we do static optimization.
        config?.runtime === 'nodejs'
        ? ssr || ssg
          ? 'nodejs'
          : undefined
        : // When the runtime is required because there is ssr or ssg we fallback
        ssr || ssg
        ? nextConfig.experimental?.runtime
        : undefined

    const middlewareConfig =
      params.page === MIDDLEWARE_FILE && getMiddlewareConfig(config)

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

function getMiddlewareConfig(config: any): Partial<MiddlewareConfig> {
  const result: Partial<MiddlewareConfig> = {}

  if (config.matching) {
    result.pathMatcher = new RegExp(
      getMiddlewareRegExpStrings(config.matching).join('|')
    )
  }

  console.log(result)

  return result
}

function getMiddlewareRegExpStrings(matching: string | string[]): string[] {
  if (Array.isArray(matching)) {
    return matching.flatMap((x) => getMiddlewareRegExpStrings(x))
  }

  if (typeof matching !== 'string') {
    throw new Error(
      '`matching` must be a path pattern or an array of path patterns'
    )
  }

  let matcher = matching.startsWith('/') ? matching : `/${matching}`
  const parsedPage = tryToParsePath(matcher)

  matcher = `/_next/data/:__nextjsBuildId__${matcher}.json`
  const parsedDataRoute = tryToParsePath(matcher)

  const regexes = [parsedPage.regexStr, parsedDataRoute.regexStr].filter(
    (x): x is string => !!x
  )
  if (regexes.length < 2) {
    throw new Error("Can't parse matcher")
  } else {
    return regexes
  }
}
