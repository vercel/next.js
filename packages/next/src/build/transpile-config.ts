import type { Options as SWCOptions } from '@swc/core'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readFile, unlink, writeFile } from 'fs/promises'
import { transform, transformSync } from './swc'

const oldJSHook = require.extensions['.js']
const extensions = ['.ts', '.cts', '.mts', '.cjs', '.mjs']

function registerHook(swcOptions: SWCOptions, shouldHandleESM: boolean) {
  if (shouldHandleESM) {
    require.extensions['.js'] = function (mod: any, oldFilename) {
      try {
        oldJSHook(mod, oldFilename)
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

async function isESMProject(cwd: string) {
  // TODO: reduce cost
  let pkgJson: any
  try {
    pkgJson = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  } catch {
    pkgJson = {}
  }
  return pkgJson.type === 'module'
}

export async function transpileConfig({
  nextConfigPath,
  cwd,
}: {
  nextConfigPath: string
  cwd: string
}) {
  const shouldHandleESM =
    nextConfigPath.endsWith('.mts') || (await isESMProject(cwd))
  // We are going to convert nextConfig as CJS format to use require hook
  const tempConfigPath = join(
    cwd,
    `next.config.${shouldHandleESM ? 'cjs' : 'js'}`
  )

  // TODO: reduce cost
  let tsConfig: any
  try {
    tsConfig = JSON.parse(await readFile(join(cwd, 'tsconfig.json'), 'utf8'))
  } catch {
    tsConfig = {}
  }

  const swcOptions = resolveSWCOptions(cwd, tsConfig)
  registerHook(swcOptions, shouldHandleESM)

  try {
    const nextConfigStr = await readFile(nextConfigPath, 'utf8')
    const { code } = await transform(nextConfigStr, swcOptions)

    // TODO: reduce cost of writing on disk, e.g. import(data:text/javascript,...)
    await writeFile(tempConfigPath, code, 'utf8')
    return await import(tempConfigPath)
  } catch (error: any) {
    if (error.code === 'ERR_REQUIRE_ESM') {
      error.code = 'NEXT_CONFIG_TS_ESM'
    }
    throw error
  } finally {
    await unlink(tempConfigPath).catch(() => {})
    require.extensions['.js'] = oldJSHook
    extensions.forEach((ext) => delete require.extensions[ext])
  }
}
