import { readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { transform, transformSync } from './swc'
import type { Options as SWCOptions } from '@swc/core'

const originalJsHandler = require.extensions['.js']
const transformableExtensions = ['.ts', '.cts', '.mts', '.cjs', '.mjs']

function registerSWCTransform(swcOptions: SWCOptions, isESM: boolean) {
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

function resolveSWCOptions(cwd: string, tsConfig: any): SWCOptions {
  const resolvedBaseUrl = join(cwd, tsConfig.compilerOptions?.baseUrl ?? '.')
  const resolvedSWCOptions: SWCOptions = {
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
  }

  return resolvedSWCOptions
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

  const swcOptions = resolveSWCOptions(cwd, tsConfig)
  registerSWCTransform(swcOptions, isESM)

  try {
    const nextConfigStr = await readFile(nextConfigPath, 'utf8')
    const { code } = await transform(nextConfigStr, swcOptions)

    // TODO: dig to not using fs ops, import(data:text/javascript,...)
    await writeFile(tempConfigPath, code, 'utf8')

    return (await import(tempConfigPath)).default
  } catch (error) {
    throw error
  } finally {
    transformableExtensions.forEach((ext) => delete require.extensions[ext])
    require.extensions['.js'] = originalJsHandler
    await unlink(tempConfigPath).catch(() => {})
  }
}
