import type { Options as SWCOptions } from '@swc/core'
import Module from 'module'
import { readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { transform, transformSync } from './swc'

const oldJSHook = require.extensions['.js']
const extensions = ['.ts', '.cts', '.mts', '.cjs', '.mjs']

function registerHook(swcOptions: SWCOptions) {
  require.extensions['.js'] = function (mod: any, oldFilename) {
    try {
      return oldJSHook(mod, oldFilename)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ERR_REQUIRE_ESM') {
        throw error
      }

      // calling oldJSHook throws ERR_REQUIRE_ESM, so run _compile manually
      // TODO: investigate if we can remove readFileSync
      const content = readFileSync(oldFilename, 'utf8')
      const { code } = transformSync(content, swcOptions)
      mod._compile(code, oldFilename)
    }
  }

  for (const ext of extensions) {
    const oldHook = require.extensions[ext] ?? oldJSHook
    require.extensions[ext] = function (mod: any, oldFilename) {
      const _compile = mod._compile

      mod._compile = function (code: string, filename: string) {
        const swc = transformSync(code, swcOptions)
        return _compile.call(this, swc.code, filename)
      }

      return oldHook(mod, oldFilename)
    }
  }
}

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

function requireFromString(code: string, cwd: string) {
  const filename = join(cwd, 'next.config.compiled.js')
  const paths = (Module as any)._nodeModulePaths(cwd)
  const m = new Module(filename, module.parent!) as any
  m.paths = paths
  m._compile(code, filename)
  return m.exports
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
    return requireFromString(code, cwd)
  } catch (error) {
    throw error
  } finally {
    require.extensions['.js'] = oldJSHook
    extensions.forEach((ext) => delete require.extensions[ext])
  }
}
