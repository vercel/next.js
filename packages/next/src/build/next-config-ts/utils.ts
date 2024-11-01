import type { ModuleConfig, Options as SWCOptions } from '@swc/core'
import type { ParsedCommandLine } from 'typescript'

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

import { findPagesDir } from '../../lib/find-pages-dir.js'
import { getTypeScriptConfiguration } from '../../lib/typescript/getTypeScriptConfiguration.js'
import { verifyTypeScriptSetup } from '../../lib/verify-typescript-setup.js'

export async function resolveSWCOptions(
  url: string,
  cwd: string
): Promise<SWCOptions> {
  const ext = extname(url)

  const packageJsonType = await getPackageJsonType(cwd)
  const { options } = await getTSConfig(cwd)

  let moduleType: ModuleConfig['type'] = 'commonjs'
  if (packageJsonType === 'module' || ext === '.mts') {
    moduleType = 'es6'
  }
  if (ext === '.cts') {
    moduleType = 'commonjs'
  }

  console.log({ moduleType })

  return {
    jsc: {
      parser: {
        syntax: 'typescript',
      },
      paths: options.paths,
      baseUrl: options.baseUrl ? resolve(options.baseUrl) : undefined,
      experimental: {
        keepImportAttributes: true,
        emitAssertForImportAttributes: true,
      },
    },
    module: {
      type: moduleType,
    },
    env: {
      targets: {
        node: process.versions.node,
      },
    },
  } satisfies SWCOptions
}

async function getTSConfig(cwd: string): Promise<ParsedCommandLine> {
  const { pagesDir, appDir } = findPagesDir(cwd)

  const verifyResult = await verifyTypeScriptSetup({
    dir: cwd,
    // TODO: do we map the correct distDir again?
    distDir: '.next', // should be temporary
    tsconfigPath: 'tsconfig.json',
    intentDirs: [pagesDir, appDir].filter(Boolean) as string[],
    typeCheckPreflight: false,
    disableStaticImages: false,
    hasAppDir: Boolean(appDir),
    hasPagesDir: Boolean(pagesDir),
    hasNextConfigTs: true,
  })

  const { ts, resolvedTsConfigPath } = verifyResult.typescriptInfo!
  const tsConfig = await getTypeScriptConfiguration(
    ts,
    resolvedTsConfigPath,
    true
  )

  return tsConfig
}

async function getPackageJsonType(cwd: string): Promise<'commonjs' | 'module'> {
  if (!existsSync(join(cwd, 'package.json'))) {
    return 'commonjs'
  }

  const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  return pkg.type ?? 'commonjs'
}
