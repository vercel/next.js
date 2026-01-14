import type { Options as SWCOptions } from '@swc/core'
import type { CompilerOptions } from 'typescript'

import path from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import * as CommentJson from 'next/dist/compiled/comment-json'
import { deregisterHook, registerHook, requireFromString } from './require-hook'
import { warn, warnOnce } from '../output/log'
import { getNodeOptionsArgs } from '../../server/lib/utils'

type RelevantCompilerOptions = Pick<CompilerOptions, 'paths' | 'baseUrl'>

function resolveSWCOptions(
  cwd: string,
  compilerOptions: RelevantCompilerOptions
): SWCOptions {
  return {
    jsc: {
      parser: {
        syntax: 'typescript',
      },
      ...(compilerOptions.paths ? { paths: compilerOptions.paths } : {}),
      ...(compilerOptions.baseUrl
        ? // Needs to be an absolute path.
          { baseUrl: path.resolve(cwd, compilerOptions.baseUrl) }
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

function resolveExtends(extendsPath: string, currentConfigDir: string): string {
  // Relative paths are resolved relative to the current config's directory
  if (
    extendsPath.startsWith('./') ||
    extendsPath.startsWith('../') ||
    path.isAbsolute(extendsPath)
  ) {
    const resolved = path.resolve(currentConfigDir, extendsPath)
    // TypeScript allows omitting .json extension
    if (existsSync(resolved)) {
      return resolved
    }
    if (!resolved.endsWith('.json') && existsSync(resolved + '.json')) {
      return resolved + '.json'
    }
    return resolved
  }

  // Package paths - use require.resolve to find the package
  try {
    // Try resolving as a direct path within the package
    return require.resolve(extendsPath, { paths: [currentConfigDir] })
  } catch {
    // If that fails, try appending tsconfig.json for package names like "@tsconfig/node18"
    try {
      return require.resolve(extendsPath + '/tsconfig.json', {
        paths: [currentConfigDir],
      })
    } catch {
      // Return the original path and let it fail later with a clear error
      return path.resolve(currentConfigDir, extendsPath)
    }
  }
}

function loadTsConfigFile(
  configPath: string,
  visited: Set<string>
): RelevantCompilerOptions {
  const resolvedPath = path.resolve(configPath)

  if (visited.has(resolvedPath)) {
    return {}
  }
  visited.add(resolvedPath)

  if (!existsSync(resolvedPath)) {
    return {}
  }

  const configContent = readFileSync(resolvedPath, 'utf8')
  const config = CommentJson.parse(configContent)
  const configDir = path.dirname(resolvedPath)

  let mergedOptions: RelevantCompilerOptions = {}

  // Note that config options from `extends` should get overwritten, not merged
  if (config.extends) {
    const extendsList = Array.isArray(config.extends)
      ? config.extends
      : [config.extends]

    for (const extendsPath of extendsList) {
      const parentConfigPath = resolveExtends(extendsPath, configDir)
      const parentOptions = loadTsConfigFile(parentConfigPath, visited)
      mergedOptions = { ...mergedOptions, ...parentOptions }
    }
  }

  const currentOptions = config.compilerOptions ?? {}
  mergedOptions = {
    ...mergedOptions,
    paths: currentOptions.paths ?? mergedOptions.paths,
    baseUrl: currentOptions.baseUrl ?? mergedOptions.baseUrl,
  }

  return mergedOptions
}

async function loadTsConfig(dir: string): Promise<RelevantCompilerOptions> {
  // NOTE: This doesn't fully cover the edge case for setting
  // "typescript.tsconfigPath" in next config which is currently
  // a restriction.
  // It's a chicken-and-egg problem since we need to transpile
  // the next config to get that value.
  const resolvedTsConfigPath = path.join(dir, 'tsconfig.json')

  if (!existsSync(resolvedTsConfigPath)) {
    return {}
  }

  return loadTsConfigFile(resolvedTsConfigPath, new Set())
}

export async function transpileConfig({
  nextConfigPath,
  dir,
}: {
  nextConfigPath: string
  dir: string
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
            `Skipped resolving "${path.basename(nextConfigPath)}" using Node.js native TypeScript resolution because it was disabled by the "--no-experimental-strip-types" flag.` +
              ' Falling back to legacy resolution.' +
              ' Learn more: https://nextjs.org/docs/app/api-reference/config/typescript#using-nodejs-native-typescript-resolver-for-nextconfigts'
          )
        }

        // Feature is not enabled, fallback to legacy resolution for current session.
        process.env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED = 'false'
      } catch (cause) {
        warnOnce(
          `Failed to import "${path.basename(nextConfigPath)}" using Node.js native TypeScript resolution.` +
            ' Falling back to legacy resolution.' +
            ' Learn more: https://nextjs.org/docs/app/api-reference/config/typescript#using-nodejs-native-typescript-resolver-for-nextconfigts',
          { cause }
        )
        // Once failed, fallback to legacy resolution for current session.
        process.env.__NEXT_NODE_NATIVE_TS_LOADER_ENABLED = 'false'
      }
    }

    const compilerOptions = await loadTsConfig(dir)
    return handleCJS({ dir, nextConfigPath, compilerOptions })
  } catch (cause) {
    throw new Error(`Failed to transpile "${path.basename(nextConfigPath)}".`, {
      cause,
    })
  }
}

async function handleCJS({
  dir,
  nextConfigPath,
  compilerOptions,
}: {
  dir: string
  nextConfigPath: string
  compilerOptions: RelevantCompilerOptions
}) {
  const swcOptions = resolveSWCOptions(dir, compilerOptions)
  let hasRequire = false
  try {
    const nextConfigString = readFileSync(nextConfigPath, 'utf8')
    // lazy require swc since it loads React before even setting NODE_ENV
    // resulting loading Development React on Production
    const { loadBindings } = require('../swc') as typeof import('../swc')
    const bindings = await loadBindings()
    const { code } = await bindings.transform(nextConfigString, swcOptions)

    // register require hook only if require exists
    if (code.includes('require(')) {
      registerHook(swcOptions)
      hasRequire = true
    }

    // filename & extension don't matter here
    const config = requireFromString(
      code,
      path.resolve(dir, 'next.config.compiled.js')
    )
    // At this point we have already loaded the bindings without this configuration setting due to the `transform` call above.
    // Possibly we fell back to wasm in which case, it all works out but if not we need to warn
    // that the configuration was ignored.
    if (config?.experimental?.useWasmBinary && !bindings.isWasm) {
      warn(
        'Using a next.config.ts file is incompatible with `experimental.useWasmBinary` unless ' +
          '`--experimental-next-config-strip-types` is also passed.\nSetting `useWasmBinary` to `false'
      )
      config.experimental.useWasmBinary = false
    }
    return config
  } catch (error) {
    throw error
  } finally {
    if (hasRequire) {
      deregisterHook()
    }
  }
}
