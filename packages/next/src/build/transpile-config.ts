import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { transform, transformSync } from './swc'

function registerSWCTransform(swcOptions: any) {
  require.extensions['.ts'] = function (m: any, filename) {
    const originalJsHandler = require.extensions['.js']

    const _compile = m._compile

    m._compile = function (code: string, fileName: string) {
      const swc = transformSync(code, swcOptions)
      return _compile.call(this, swc.code, fileName)
    }

    return originalJsHandler(m, filename)
  }
}

function resolveSWCOptions(tsConfig: any) {
  const baseSWCOptions = {
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

  const swcOptions = {
    ...baseSWCOptions,
    // TODO: Find out why throw "SIGABRT" and fix it.
    // jsc: {
    //   ...baseSWCOptions.jsc,
    //   baseUrl: tsConfig.compilerOptions?.baseUrl,
    //   paths: tsConfig.compilerOptions?.paths,
    // },
  }

  return swcOptions
}

export async function transpileConfig({
  nextConfigPath,
  cwd,
}: {
  nextConfigPath: string
  cwd: string
}) {
  const tempPath = join(cwd, 'next.config.js')
  let tsConfig: any
  try {
    tsConfig = JSON.parse(await readFile(join(cwd, 'tsconfig.json'), 'utf8'))
  } catch {
    tsConfig = {}
  }

  const swcOptions = resolveSWCOptions(tsConfig)
  await registerSWCTransform(swcOptions)

  try {
    const nextConfigStr = await readFile(nextConfigPath, 'utf8')
    const { code } = await transform(nextConfigStr, swcOptions)

    await writeFile(tempPath, code, 'utf8')

    return await import(tempPath)
  } catch (error) {
    throw error
  } finally {
    delete require.extensions['.ts']
  }
}
