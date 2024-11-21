import type { Options as SWCOptions } from '@swc/core'
import type { CompilerOptions } from 'typescript'

import { resolve } from 'node:path'
import { parseJsonFile } from '../load-jsconfig'

export function resolveSWCOptions(cwd: string): SWCOptions {
  const tsConfig = lazilyGetTSConfig(cwd)

  return {
    jsc: {
      parser: {
        syntax: 'typescript',
      },
      paths: tsConfig?.compilerOptions?.paths,
      // SWC requires `baseUrl` to be passed when `paths` are used.
      // Also, `baseUrl` must be absolute.
      baseUrl: resolve(cwd, tsConfig?.compilerOptions?.baseUrl ?? ''),
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
  compilerOptions?: CompilerOptions
} {
  let tsConfig = {}
  try {
    tsConfig = parseJsonFile(resolve(cwd, 'tsconfig.json'))
  } catch (error) {
    // ignore if tsconfig.json does not exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  return tsConfig
}

// A bare specifier is a specifier that is not a relative path or a URL.
// e.g. "next", "react", etc.
export function isBareSpecifier(specifier: string) {
  // Relative paths are not bare specifiers.
  // e.g. "./foo"
  if (specifier.startsWith('.')) {
    return false
  }

  // URLs are not bare specifiers.
  // e.g. "file://", "https://", etc.
  try {
    new URL(specifier)
  } catch {
    // new URL('next') will throw something like:
    // "Failed to construct 'URL': Invalid URL"
    return true
  }

  return false
}
