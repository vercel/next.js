import type { Options as SWCOptions } from '@swc/core'
import type { CompilerOptions } from 'typescript'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { deregisterHook, registerHook, requireFromString } from './require-hook'
import { parseJsonFile } from '../load-jsconfig'

function resolveSWCOptions(
  cwd: string,
  compilerOptions: CompilerOptions
): SWCOptions {
  const resolvedBaseUrl = join(cwd, compilerOptions.baseUrl ?? '.')
  return {
    jsc: {
      target: 'es5',
      parser: {
        syntax: 'typescript',
      },
      paths: compilerOptions.paths,
      baseUrl: resolvedBaseUrl,
    },
    module: {
      type: 'commonjs',
    },
    isModule: 'unknown',
  } satisfies SWCOptions
}

async function lazilyGetTSConfig(cwd: string) {
  let tsConfig: { compilerOptions: CompilerOptions }
  try {
    tsConfig = parseJsonFile(join(cwd, 'tsconfig.json'))
  } catch (error) {
    // ignore if tsconfig.json does not exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    tsConfig = { compilerOptions: {} }
  }

  return tsConfig
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
    const { compilerOptions } = await lazilyGetTSConfig(cwd)
    const swcOptions = resolveSWCOptions(cwd, compilerOptions)

    const nextConfigString = await readFile(nextConfigPath, 'utf8')
    // lazy require swc since it loads React before even setting NODE_ENV
    // resulting loading Development React on Production
    const { transform } = require('../swc')
    let { code } = await transform(nextConfigString, swcOptions)

    // register require hook only if require exists
    if (code.includes('require(')) {
      registerHook(swcOptions)
      hasRequire = true
    }

    // wrap with async IIFE if await is used
    if (code.includes('await')) {
      code = `(async function(){${code}})();`
    }

    // filename & extension don't matter here
    return await requireFromString(code, join(cwd, 'next.config.compiled.js'))
  } catch (error) {
    throw error
  } finally {
    if (hasRequire) {
      deregisterHook()
    }
  }
}
