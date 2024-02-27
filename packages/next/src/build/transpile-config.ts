import { readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { transform, transformSync } from './swc'
import type { Options } from '@swc/core'

const originalJsHandler = require.extensions['.js']
const transformableExtensions = ['.ts', '.cts', '.mts', '.cjs', '.mjs']

function registerSWCTransform(swcOptions: Options, isESM: boolean) {
  if (isESM) {
    // TODO: Implement importing ESM
  }

  for (const ext of transformableExtensions) {
    require.extensions[ext] = function (m: any, originalFileName) {
      const _compile = m._compile

      m._compile = function (code: string, filename: string) {
        const swc = transformSync(code, swcOptions)
        return _compile.call(this, swc.code, filename)
      }

      return originalJsHandler(m, originalFileName)
    }
  }
}

function resolveSWCOptions(_tsConfig: any): Options {
  const baseSWCOptions: Options = {
    jsc: {
      target: 'es5',
      parser: {
        syntax: 'typescript',
      },
    },
    module: {
      type: 'commonjs',
    },
    isModule: 'unknown',
  }

  // See https://github.com/vercel/next.js/pull/57656#issuecomment-1962359584
  // const swcOptions: Options = {
  //   ...baseSWCOptions,
  //   jsc: {
  //     ...baseSWCOptions.jsc,
  //     baseUrl: tempResolveBase,
  //     paths: tsConfig.compilerOptions?.paths,
  //   },
  // }

  return baseSWCOptions
}

async function validateModuleType(
  cwd: string,
  nextConfigPath: string
): Promise<'commonjs' | 'module'> {
  if (nextConfigPath.endsWith('.mts')) {
    return 'module'
  }

  let packageJson: any
  try {
    packageJson = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  } catch {}

  if (packageJson.type === 'module') {
    return 'module'
  }

  return 'commonjs'
}

export async function transpileConfig({
  nextConfigPath,
  cwd,
}: {
  nextConfigPath: string
  cwd: string
}) {
  const moduleType = await validateModuleType(cwd, nextConfigPath)
  const isESM = moduleType === 'module'
  // We are going to convert next config as CJS to use require hook
  const tempConfigPath = join(cwd, `next.config.${isESM ? 'cjs' : 'js'}`)

  let tsConfig: any
  try {
    // TODO: Use dynamic import when repo TS upgraded >= 5.3
    tsConfig = JSON.parse(await readFile(join(cwd, 'tsconfig.json'), 'utf8'))
  } catch {
    tsConfig = {}
  }

  const swcOptions = resolveSWCOptions(tsConfig)
  registerSWCTransform(swcOptions, isESM)

  try {
    const nextConfigStr = await readFile(nextConfigPath, 'utf8')
    const { code } = await transform(nextConfigStr, swcOptions)

    await writeFile(tempConfigPath, code, 'utf8')

    return (await import(tempConfigPath)).default
  } catch (error) {
    throw error
  } finally {
    await unlink(tempConfigPath).catch(() => {})
    transformableExtensions.forEach((ext) => delete require.extensions[ext])
  }
}
