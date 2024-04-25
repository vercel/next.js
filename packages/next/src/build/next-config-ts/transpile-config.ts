import type { CompilerOptions } from 'typescript'
import type { Options as SWCOptions } from '@swc/core'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deregisterHook, registerHook, requireFromString } from './require-hook'
import { transform } from '../swc'

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

// since tsconfig allows JS comments (jsonc), strip them for JSON.parse
function stripComments(str: string) {
  return str.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) =>
    g ? '' : m
  )
}

async function lazilyGetTSConfig(cwd: string) {
  let tsConfig: { compilerOptions: CompilerOptions }
  try {
    tsConfig = JSON.parse(
      stripComments(await readFile(join(cwd, 'tsconfig.json'), 'utf8'))
    )
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
    const { code } = await transform(nextConfigString, swcOptions)

    // register require hook only if require exists
    if (code.includes('require(')) {
      registerHook(swcOptions)
      hasRequire = true
    }

    // filename / extension don't matter
    return requireFromString(code, join(cwd, 'next.config.compiled.js'))
  } catch (error) {
    throw error
  } finally {
    if (hasRequire) {
      deregisterHook()
    }
  }
}
