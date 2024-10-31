import type { JscTarget, ModuleConfig, Options as SWCOptions } from '@swc/core'
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
  const { tsConfig, ts } = await getTypeScriptInfo(cwd)

  const shouldBeCJS = ext === '.cts'
  const shouldBeESM =
    ext === '.mts' || (ext === '.ts' && packageJsonType === 'module')

  // enum 4 is 'ES2017'
  let target = ts.ScriptTarget[tsConfig.options.target ?? 4]

  if (target === 'Latest' || target === 'ES2023') {
    target = 'esnext'
  }

  // enum 99 is 'ESNext'
  let module = ts.ModuleKind[tsConfig.options.module ?? 99]

  if (module === 'None') {
    module = 'commonjs'
  }
  if (module === 'System') {
    module = 'systemjs'
  }
  if (module === 'Node16') {
    module = 'nodenext'
  }
  if (
    module === 'ES2015' ||
    module === 'ES2020' ||
    module === 'ES2022' ||
    module === 'ESNext' ||
    module === 'Preserve'
  ) {
    module = 'es6'
  }

  if (shouldBeCJS) {
    module = 'commonjs'
  }
  if (shouldBeESM) {
    module = 'es6'
  }

  return {
    jsc: {
      target: target as JscTarget,
      parser: {
        syntax: 'typescript',
      },
    },
    module: {
      type: module as ModuleConfig['type'],
    },
    isModule: 'unknown',
  } satisfies SWCOptions
}

async function getTypeScriptInfo(cwd: string): Promise<{
  tsConfig: ParsedCommandLine
  ts: typeof import('typescript')
}> {
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

  return { tsConfig, ts }
}

async function getPackageJsonType(cwd: string): Promise<'commonjs' | 'module'> {
  if (!existsSync(join(cwd, 'package.json'))) {
    return 'commonjs'
  }

  const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  return pkg.type ?? 'commonjs'
}
