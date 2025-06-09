import type { Options as SWCOptions } from '@swc/core'
import type { CompilerOptions } from 'typescript'

import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { deregisterHook, registerHook, requireFromString } from './require-hook'
import { warn } from '../output/log'
import { installDependencies } from '../../lib/install-dependencies'

function resolveSWCOptions(
  cwd: string,
  compilerOptions: CompilerOptions
): SWCOptions {
  const resolvedBaseUrl = resolve(cwd, compilerOptions.baseUrl ?? '.')
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

// Ported from next/src/lib/verify-typescript-setup.ts
// Although this overlaps with the later `verifyTypeScriptSetup`,
// it is acceptable since the time difference in the worst case is trivial,
// as we are only preparing to install the dependencies once more.
async function verifyTypeScriptSetup(cwd: string, configFileName: string) {
  try {
    // Quick module check.
    require.resolve('typescript', { paths: [cwd] })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'MODULE_NOT_FOUND'
    ) {
      warn(
        `Installing TypeScript as it was not found while loading "${configFileName}".`
      )

      await installDependencies(cwd, [{ pkg: 'typescript' }], true).catch(
        (err) => {
          if (err && typeof err === 'object' && 'command' in err) {
            console.error(
              `Failed to install TypeScript, please install it manually to continue:\n` +
                (err as any).command +
                '\n'
            )
          }
          throw err
        }
      )
    }
  }
}

async function getTsConfig(cwd: string): Promise<CompilerOptions> {
  const ts: typeof import('typescript') = require(
    require.resolve('typescript', { paths: [cwd] })
  )

  // NOTE: This doesn't fully cover the edge case for setting
  // "typescript.tsconfigPath" in next config which is currently
  // a restriction.
  const tsConfigPath = ts.findConfigFile(
    cwd,
    ts.sys.fileExists,
    'tsconfig.json'
  )

  if (!tsConfigPath) {
    // It is ok to not return ts.getDefaultCompilerOptions() because
    // we are only lookfing for paths and baseUrl from tsConfig.
    return {}
  }

  const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile)
  const parsedCommandLine = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    cwd
  )

  return parsedCommandLine.options
}

export async function transpileConfig({
  nextConfigPath,
  configFileName,
  cwd,
}: {
  nextConfigPath: string
  configFileName: string
  cwd: string
}) {
  let hasRequire = false
  try {
    // Ensure TypeScript is installed to use the API.
    await verifyTypeScriptSetup(cwd, configFileName)

    const compilerOptions = await getTsConfig(cwd)
    const swcOptions = resolveSWCOptions(cwd, compilerOptions)

    const nextConfigString = await readFile(nextConfigPath, 'utf8')
    // lazy require swc since it loads React before even setting NODE_ENV
    // resulting loading Development React on Production
    const { transform } = require('../swc') as typeof import('../swc')
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
