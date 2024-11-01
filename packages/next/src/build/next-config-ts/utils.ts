import type { Options as SWCOptions } from '@swc/core'
import type { CompilerOptions } from 'typescript'

import { resolve } from 'node:path'
import { parseJsonFile } from '../load-jsconfig'

export function resolveSWCOptions(cwd: string): SWCOptions {
  const { compilerOptions } = lazilyGetTSConfig(cwd)

  return {
    jsc: {
      parser: {
        syntax: 'typescript',
      },
      paths: compilerOptions.paths,
      // SWC requires `baseUrl` to be passed when `paths` are used.
      // Also, `baseUrl` must be absolute.
      baseUrl: resolve(cwd, compilerOptions.baseUrl ?? ''),
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

// Since we only need "paths" and "baseUrl" from tsconfig for now,
// we lazily look for tsconfig.json at cwd. Does not cover edge cases
// like "extends" or even the case where tsconfig.json does not exist.
export function lazilyGetTSConfig(cwd: string): {
  compilerOptions: CompilerOptions
} {
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

// A bare specifier is a specifier that is not a relative path or a URL.
// e.g. "next", "react", etc.
// x-ref: https://youtu.be/XbY4IG0TbB4?feature=shared&t=857
export function isBareSpecifier(specifier: string) {
  if (specifier.startsWith('.')) {
    return false
  }

  try {
    new URL(specifier)
  } catch {
    return true
  }

  return false
}
