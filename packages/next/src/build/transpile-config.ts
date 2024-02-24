import { readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { transform, transformSync } from './swc'
import type { Options } from '@swc/core'

function registerSWCTransform(swcOptions: Options) {
  require.extensions['.ts'] = function (m: any, originalFileName) {
    const originalJsHandler = require.extensions['.js']

    const _compile = m._compile

    m._compile = function (code: string, filename: string) {
      const swc = transformSync(code, swcOptions)
      return _compile.call(this, swc.code, filename)
    }

    return originalJsHandler(m, originalFileName)
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
  nextConfigPath: string,
  cwd: string
): Promise<'commonjs' | 'es6'> {
  if (nextConfigPath.endsWith('.mts')) {
    return 'es6'
  }

  let packageJson: any
  try {
    packageJson = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  } catch {}

  if (packageJson.type === 'module') {
    return 'es6'
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
  const moduleType = await validateModuleType(nextConfigPath, cwd)
  const isESM = moduleType === 'es6'
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
  registerSWCTransform(swcOptions)

  try {
    const nextConfigStr = await readFile(nextConfigPath, 'utf8')
    const { code } = await transform(nextConfigStr, swcOptions)

    await writeFile(tempConfigPath, code, 'utf8')

    return await import(tempConfigPath)
  } catch (error) {
    throw error
  } finally {
    delete require.extensions['.ts']
    await unlink(tempConfigPath)
  }
}
