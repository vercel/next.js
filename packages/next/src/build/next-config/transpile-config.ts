import { readFile, unlink, writeFile } from 'fs/promises'
import { extname, join } from 'path'
import { bundleConfig } from './bundle-config'
import { registerTransform } from './register-require-hook'
import { resolveSWCOptions, getModuleType, hasImportOrRequire } from './utils'
import { transform } from '../swc'

const transformableExtensions = ['.ts', '.cts', '.mts', '.cjs', '.mjs']

export async function transpileConfig({
  nextConfigPath,
  nextConfigName,
  cwd,
}: {
  nextConfigPath: string
  nextConfigName: string
  cwd: string
}) {
  let tsConfig: any = {}
  try {
    // TODO: Use dynamic import when repo TS upgraded >= 5.3
    tsConfig = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  } catch {}

  // package.json type: module or next.config.mts
  const isESM =
    extname(nextConfigName) === '.mts' ||
    (await getModuleType(cwd)) === 'module'
  // Since Native ESM (.js) cannot be resolved by require hooks, we need to bundle it.
  if (isESM) {
    return await bundleConfig({
      nextConfigPath,
      cwd,
      tsConfig,
    })
  }

  const tempConfigPath = join(cwd, 'next.config.compiled.cjs')
  const swcOptions = resolveSWCOptions({ tsConfig })

  // If `require` or `import` exists, use require hook to transpile it on the fly
  const needCustomRequireHook = await hasImportOrRequire(nextConfigPath)
  if (needCustomRequireHook) {
    const originalRequireHook = require.extensions['.js']
    registerTransform(swcOptions, originalRequireHook, transformableExtensions)
  }

  try {
    const { code } = await transform(nextConfigPath, swcOptions)
    await writeFile(tempConfigPath, code, 'utf8')

    return await import(tempConfigPath)
  } catch (error) {
    throw error
  } finally {
    await unlink(tempConfigPath).catch(() => {})

    if (needCustomRequireHook) {
      transformableExtensions.forEach((ext) => {
        delete require.extensions[ext]
      })
    }
  }
}
