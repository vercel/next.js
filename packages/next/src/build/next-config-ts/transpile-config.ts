import type { Options as SWCOptions } from '@swc/core'
import type { CompilerOptions } from 'typescript'
import { resolve } from 'path'
import { readFile } from 'fs/promises'
import semver from 'next/dist/compiled/semver'
import { deregisterHook, registerHook, requireFromString } from './require-hook'
import { lazilyGetTSConfig } from './utils'

function resolveSWCOptionsForNextConfigRequireHook(
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
  configFileName,
  cwd,
  isFallback,
}: {
  nextConfigPath: string
  configFileName: string
  cwd: string
  isFallback: boolean
}) {
  let hasRequire = false
  try {
    const tsConfig = lazilyGetTSConfig(cwd)
    const swcOptions = resolveSWCOptionsForNextConfigRequireHook(
      cwd,
      tsConfig.compilerOptions ?? {}
    )

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
    // Fallback to the require hook because the loader was needed but the
    // `module.register` is missing. Throw based on the Node.js version
    // as it can be resolved when using the loader.
    if (isFallback) {
      // TODO: Remove the version detects that passed the current minimum Node.js version.
      const nodeVersion = process?.versions?.node

      // `process.versions.node` value may be missing in other runtimes.
      if (!nodeVersion) {
        throw new Error(
          'Module.register is not available and cannot find Node.js version.\n' +
            'Please upgrade to Node.js higher than 18.x with 18.19.0 or 20.x with 20.6.0.',
          { cause: error }
        )
      }

      const configErrorReason =
        configFileName === 'next.config.mts'
          ? configFileName
          : `${configFileName} with Native ESM app (package.json type: module)`

      // `module.register` was added in Node.js v18.19.0, v20.6.0
      if (semver.lt(nodeVersion, '18.19.0')) {
        throw new Error(
          `${configErrorReason} requires Node.js 18.19.0 or higher (current: ${nodeVersion}).`,
          { cause: error }
        )
      }
      if (
        semver.satisfies(nodeVersion, '20.x') &&
        semver.lt(nodeVersion, '20.6.0')
      ) {
        throw new Error(
          `${configErrorReason} requires Node.js 20.6.0 or higher (current: ${nodeVersion}).`,
          { cause: error }
        )
      }
      // `module.register` is not supported on Node.js v19.
      if (semver.satisfies(nodeVersion, '19.x')) {
        throw new Error(
          `${configErrorReason} is not supported on Node.js v19 (current: ${nodeVersion}). Please upgrade to Node.js 20.6.0 or higher.`,
          { cause: error }
        )
      }
    }

    throw error
  } finally {
    if (hasRequire) {
      deregisterHook()
    }
  }
}
