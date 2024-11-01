import type { Options as SWCOptions } from '@swc/core'
import type { ParsedCommandLine } from 'typescript'

import { resolve } from 'node:path'

import { findPagesDir } from '../../lib/find-pages-dir.js'
import { getTypeScriptConfiguration } from '../../lib/typescript/getTypeScriptConfiguration.js'
import { verifyTypeScriptSetup } from '../../lib/verify-typescript-setup.js'

export async function resolveSWCOptions(cwd: string): Promise<SWCOptions> {
  const { options } = await getTSConfig(cwd)

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
