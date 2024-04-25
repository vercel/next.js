import type { Options as SWCOptions } from '@swc/core'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deregisterHook, registerHook, requireFromString } from './require-hook'
import { transform } from '../swc'

function resolveSWCOptions(cwd: string, tsConfig: any): SWCOptions {
  const resolvedBaseUrl = join(cwd, tsConfig.compilerOptions?.baseUrl ?? '.')
  return {
    jsc: {
      target: 'es5',
      parser: {
        syntax: 'typescript',
      },
      paths: tsConfig.compilerOptions?.paths,
      baseUrl: resolvedBaseUrl,
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
  // TODO: reduce cost
  let tsConfig: any
  try {
    tsConfig = JSON.parse(await readFile(join(cwd, 'tsconfig.json'), 'utf8'))
  } catch {
    tsConfig = {}
  }

  const swcOptions = resolveSWCOptions(cwd, tsConfig)
  registerHook(swcOptions)

  try {
    const nextConfigStr = await readFile(nextConfigPath, 'utf8')
    const { code } = await transform(nextConfigStr, swcOptions)
    return requireFromString(code, join(cwd, 'next.config.compiled.js'))
  } catch (error) {
    throw error
  } finally {
    deregisterHook()
  }
}
