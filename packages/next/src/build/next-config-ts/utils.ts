import type { Options as SWCOptions } from '@swc/core'
import type { CompilerOptions } from 'typescript'
import { resolve } from 'path'
import { parseJsonFile } from '../load-jsconfig'

export function resolveSWCOptionsForNextConfigLoader(cwd: string): SWCOptions {
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

// There are three types of `import` Specifiers:
// - Relative specifiers like './foo.js'
// - Bare specifiers like 'next' or 'next/dist/compiled/react'
// - Absolute specifiers like 'file:///path/to/module'
// x-ref: https://nodejs.org/api/esm.html#import-specifiers
export function isBareSpecifier(specifier: string) {
  // Specifiers starting with "." are Relative specifiers.
  if (specifier.startsWith('.')) {
    return false
  }

  // URL-like specifiers are Absolute specifiers.
  try {
    new URL(specifier)
  } catch {
    // If the specifier is not a valid URL nor a relative path, it's a Bare specifier.
    // e.g. new URL('next') will throw something like:
    // "TypeError [ERR_INVALID_URL]: Invalid URL"
    return true
  }

  return false
}
