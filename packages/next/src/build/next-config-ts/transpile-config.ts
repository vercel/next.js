import type { Options as SWCOptions } from '@swc/core'
import type { CompilerOptions } from 'typescript'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { deregisterHook, registerHook, requireFromString } from './require-hook'
import { lazilyGetTSConfig } from './utils'

function resolveSWCOptions(
  cwd: string,
  compilerOptions: CompilerOptions
): SWCOptions {
  return {
    jsc: {
      target: 'es5',
      parser: {
        syntax: 'typescript',
      },
      paths: compilerOptions.paths,
      // SWC requires `baseUrl` to be passed when `paths` are used.
      // Also, `baseUrl` must be absolute.
      baseUrl: resolve(cwd, compilerOptions.baseUrl ?? ''),
    },
    module: {
      type: 'commonjs',
    },
    isModule: 'unknown',
  } satisfies SWCOptions
}

export async function transpileConfig({
  nextConfigPath,
  cwd,
}: {
  nextConfigPath: string
  cwd: string
}) {
  let hasRequire = false
  try {
    const { compilerOptions } = lazilyGetTSConfig(cwd)
    const swcOptions = resolveSWCOptions(cwd, compilerOptions)

    const nextConfigString = await readFile(nextConfigPath, 'utf8')
    // lazy require swc since it loads React before even setting NODE_ENV
    // resulting loading Development React on Production
    const { transform } = require('../swc')
    const { code } = await transform(nextConfigString, swcOptions)

    // register require hook only if require exists
    if (code.includes('require(')) {
      registerHook(swcOptions)
      hasRequire = true
    }

    // filename & extension don't matter here
    return requireFromString(code, resolve(cwd, 'next.config.compiled.js'))
  } catch (error) {
    throw error
  } finally {
    if (hasRequire) {
      deregisterHook()
    }
  }
}
