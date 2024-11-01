import type { Options as SWCOptions } from '@swc/core'
import type { CompilerOptions } from 'typescript'

import { resolve } from 'node:path'
import { parseJsonFile } from '../load-jsconfig'

export async function resolveSWCOptions(cwd: string): Promise<SWCOptions> {
  const { compilerOptions } = await lazilyGetTSConfig(cwd)
  const resolvedBaseUrl = compilerOptions.baseUrl
    ? resolve(cwd, compilerOptions.baseUrl)
    : undefined

  console.log({ resolvedBaseUrl })

  return {
    jsc: {
      parser: {
        syntax: 'typescript',
      },
      paths: compilerOptions.paths,
      baseUrl: resolvedBaseUrl,
      experimental: {
        keepImportAttributes: true,
        emitAssertForImportAttributes: true,
      },
    },
    env: {
      targets: {
        node: process.versions.node,
      },
    },
  } satisfies SWCOptions
}

export async function lazilyGetTSConfig(
  cwd: string
): Promise<{ compilerOptions: CompilerOptions }> {
  let tsConfig: { compilerOptions: CompilerOptions }
  try {
    tsConfig = parseJsonFile(resolve(cwd, 'tsconfig.json'))
  } catch (error) {
    // ignore if tsconfig.json does not exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    tsConfig = { compilerOptions: {} }
  }

  return tsConfig
}
