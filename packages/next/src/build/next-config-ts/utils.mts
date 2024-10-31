import type { Options as SWCOptions } from '@swc/core'
import type { ParsedCommandLine } from 'typescript'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findPagesDir } from '../../lib/find-pages-dir.js'
import { getTypeScriptConfiguration } from '../../lib/typescript/getTypeScriptConfiguration.js'
import { verifyTypeScriptSetup } from '../../lib/verify-typescript-setup.js'

export async function resolveSWCOptions(url: string): Promise<SWCOptions> {
  const cwd = dirname(fileURLToPath(url))
  const ext = extname(url)

  const packageJsonType = await getPackageJsonType(cwd)
  const tsConfig = await getTSConfig(cwd)

  const isESM = ext === '.mts' || packageJsonType === 'module'
  console.log(isESM)

  const swcOptions: SWCOptions = {
    jsc: {
      target: 'esnext',
      parser: {
        syntax: 'typescript',
      },
    },
    module: {
      type: 'es6',
    },
    isModule: 'unknown',
  }

  if (tsConfig) {
    swcOptions.jsc!.paths = tsConfig.options.paths

    if (tsConfig.options.baseUrl) {
      swcOptions.jsc!.baseUrl = join(cwd, tsConfig.options.baseUrl)
    }
  }

  return swcOptions
}

async function getTSConfig(
  cwd: string
): Promise<ParsedCommandLine | undefined> {
  const { pagesDir, appDir } = findPagesDir(cwd)

  const verifyResult = await verifyTypeScriptSetup({
    dir: cwd,
    distDir: '.next', // temporary
    tsconfigPath: 'tsconfig.json',
    intentDirs: [pagesDir, appDir].filter(Boolean) as string[],
    typeCheckPreflight: false,
    disableStaticImages: false,
    hasAppDir: Boolean(appDir),
    hasPagesDir: Boolean(pagesDir),
  })

  if (!verifyResult.typescriptInfo) {
    return
  }

  const { ts, resolvedTsConfigPath } = verifyResult.typescriptInfo
  return await getTypeScriptConfiguration(ts, resolvedTsConfigPath, true)
}

async function getPackageJsonType(cwd: string): Promise<'commonjs' | 'module'> {
  if (!existsSync(join(cwd, 'package.json'))) {
    return 'commonjs'
  }

  const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  return pkg.type ?? 'commonjs'
}
