import type { Options as SWCOptions } from '@swc/core'
import type { CompilerOptions } from 'typescript'

import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { deregisterHook, registerHook, requireFromString } from './require-hook'
import { warn, warnOnce } from '../output/log'
import { installDependencies } from '../../lib/install-dependencies'
import { getNodeOptionsArgs } from '../../server/lib/utils'

function resolveSWCOptions(
  cwd: string,
  compilerOptions: CompilerOptions
): SWCOptions {
  return {
    jsc: {
      parser: {
        syntax: 'typescript',
      },
      ...(compilerOptions.paths ? { paths: compilerOptions.paths } : {}),
      ...(compilerOptions.baseUrl
        ? // Needs to be an absolute path.
          { baseUrl: resolve(cwd, compilerOptions.baseUrl) }
        : compilerOptions.paths
          ? // If paths is given, baseUrl is required.
            { baseUrl: cwd }
          : {}),
    },
    module: {
      type: 'commonjs',
    },
    isModule: 'unknown',
    env: {
      targets: {
        // Setting the Node.js version can reduce unnecessary code generation.
        node: process?.versions?.node ?? '20.19.0',
      },
    },
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
    // we are only looking for paths and baseUrl from tsConfig.
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
  try {
    // envs are passed to the workers and preserve the flag
    if (process.env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED === 'true') {
      try {
        // Node.js v22.10.0+
        // Value is 'strip' or 'transform' based on how the feature is enabled.
        // https://nodejs.org/api/process.html#processfeaturestypescript
        // TODO: Remove `as any` once we bump @types/node to v22.10.0+
        if ((process.features as any).typescript) {
          // Run import() here to catch errors and fallback to legacy resolution.
          return (await import(pathToFileURL(nextConfigPath).href)).default
        }

        if (
          getNodeOptionsArgs().includes('--no-experimental-strip-types') ||
          process.execArgv.includes('--no-experimental-strip-types')
        ) {
          warnOnce(
            `Skipped resolving "${configFileName}" using Node.js native TypeScript resolution because it was disabled by the "--no-experimental-strip-types" flag.` +
              ' Falling back to legacy resolution.' +
              ' Learn more: https://nextjs.org/docs/app/api-reference/config/typescript#using-nodejs-native-typescript-resolver-for-nextconfigts'
          )
        }

        // Feature is not enabled, fallback to legacy resolution for current session.
        process.env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED = 'false'
      } catch (cause) {
        warnOnce(
          `Failed to import "${configFileName}" using Node.js native TypeScript resolution.` +
            ' Falling back to legacy resolution.' +
            ' Learn more: https://nextjs.org/docs/app/api-reference/config/typescript#using-nodejs-native-typescript-resolver-for-nextconfigts',
          { cause }
        )
        // Once failed, fallback to legacy resolution for current session.
        process.env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED = 'false'
      }
    }

    // Ensure TypeScript is installed to use the API.
    await verifyTypeScriptSetup(cwd, configFileName)
    const compilerOptions = await getTsConfig(cwd)

    return handleCJS({ cwd, nextConfigPath, compilerOptions })
  } catch (cause) {
    throw new Error(`Failed to transpile "${configFileName}".`, { cause })
  }
}

async function handleCJS({
  cwd,
  nextConfigPath,
  compilerOptions,
}: {
  cwd: string
  nextConfigPath: string
  compilerOptions: CompilerOptions
}) {
  const swcOptions = resolveSWCOptions(cwd, compilerOptions)
  let hasRequire = false
  try {
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
