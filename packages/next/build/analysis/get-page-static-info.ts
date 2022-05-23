import type { PageRuntime } from '../../server/config-shared'
import type { NextConfig } from '../../server/config-shared'
import { tryToExtractExportedConstValue } from './extract-const-value'
import { parseModule } from './parse-module'
import { promises as fs } from 'fs'

export interface PageStaticInfo {
  runtime?: PageRuntime
  ssg?: boolean
  ssr?: boolean
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
}): Promise<PageStaticInfo> {
  const { isDev, pageFilePath, nextConfig } = params

  const fileContent = (await tryToReadFile(pageFilePath, !isDev)) || ''
  if (/runtime|getStaticProps|getServerSideProps/.test(fileContent)) {
    const swcAST = await parseModule(pageFilePath, fileContent)
    const { ssg, ssr } = checkExports(swcAST)
    const config = tryToExtractExportedConstValue(swcAST, 'config') || {}
    if (config?.runtime === 'edge') {
      return {
        runtime: config.runtime,
        ssr: ssr,
        ssg: ssg,
      }
    }

    // For Node.js runtime, we do static optimization.
    if (config?.runtime === 'nodejs') {
      return {
        runtime: ssr || ssg ? config.runtime : undefined,
        ssr: ssr,
        ssg: ssg,
      }
    }

    // When the runtime is required because there is ssr or ssg we fallback
    if (ssr || ssg) {
      return {
        runtime: nextConfig.experimental?.runtime,
        ssr: ssr,
        ssg: ssg,
      }
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
