#!/usr/bin/env node

import { existsSync } from 'fs'
import { join } from 'path'

import loadConfig from '../server/config'
import { printAndExit } from '../server/lib/utils'
import { Telemetry } from '../telemetry/storage'
import { green } from '../lib/picocolors'
import { ESLINT_DEFAULT_DIRS } from '../lib/constants'
import { runLintCheck } from '../lib/eslint/runLintCheck'
import { CompileError } from '../lib/compile-error'
import { PHASE_PRODUCTION_BUILD } from '../shared/lib/constants'
import { eventLintCheckCompleted } from '../telemetry/events'
import { getProjectDir } from '../lib/get-project-dir'
import { findPagesDir } from '../lib/find-pages-dir'
import { verifyTypeScriptSetup } from '../lib/verify-typescript-setup'

type NextLintOptions = {
  cache: boolean
  cacheLocation?: string
  cacheStrategy: string
  config?: string
  dir?: string[]
  errorOnUnmatchedPattern?: boolean
  ext: string[]
  file?: string[]
  fix?: boolean
  fixType?: string
  format?: string
  ignore: boolean
  ignorePath?: string
  inlineConfig: boolean
  maxWarnings: number
  outputFile?: string
  quiet?: boolean
  reportUnusedDisableDirectives: string
  resolvePluginsRelativeTo?: string
  rulesdir?: string
  strict?: boolean
}

const eslintOptions = (
  options: NextLintOptions,
  defaultCacheLocation: string
) => ({
  overrideConfigFile: options.config || null,
  extensions: options.ext ?? [],
  resolvePluginsRelativeTo: options.resolvePluginsRelativeTo || null,
  rulePaths: options.rulesdir ?? [],
  fix: options.fix ?? false,
  fixTypes: options.fixType ?? null,
  ignorePath: options.ignorePath || null,
  ignore: options.ignore,
  allowInlineConfig: options.inlineConfig,
  reportUnusedDisableDirectives: options.reportUnusedDisableDirectives || null,
  cache: options.cache,
  cacheLocation: options.cacheLocation || defaultCacheLocation,
  cacheStrategy: options.cacheStrategy,
  errorOnUnmatchedPattern: options.errorOnUnmatchedPattern ?? false,
})

const nextLint = async (options: NextLintOptions, directory?: string) => {
  const baseDir = getProjectDir(directory)

  // Check if the provided directory exists
  if (!existsSync(baseDir)) {
    printAndExit(`> No such directory exists as the project root: ${baseDir}`)
  }

  const nextConfig = await loadConfig(PHASE_PRODUCTION_BUILD, baseDir)

  const files = options.file ?? []
  const dirs = options.dir ?? nextConfig.eslint?.dirs
  const filesToLint = [...(dirs ?? []), ...files]

  const pathsToLint = (
    filesToLint.length ? filesToLint : ESLINT_DEFAULT_DIRS
  ).reduce((res: string[], d: string) => {
    const currDir = join(baseDir, d)

    if (!existsSync(currDir)) {
      return res
    }

    res.push(currDir)
    return res
  }, [])

  const reportErrorsOnly = Boolean(options.quiet)
  const maxWarnings = options.maxWarnings
  const formatter = options.format || null
  const strict = Boolean(options.strict)
  const outputFile = options.outputFile || null

  const distDir = join(baseDir, nextConfig.distDir)
  const defaultCacheLocation = join(distDir, 'cache', 'eslint/')
  const { pagesDir, appDir } = findPagesDir(baseDir)

  await verifyTypeScriptSetup({
    dir: baseDir,
    distDir: distDir,
    intentDirs: [pagesDir, appDir].filter(Boolean) as string[],
    typeCheckPreflight: false,
    tsconfigPath: nextConfig.typescript.tsconfigPath,
    disableStaticImages: nextConfig.images.disableStaticImages,
    hasAppDir: !!appDir,
    hasPagesDir: !!pagesDir,
  })

  runLintCheck(baseDir, pathsToLint, {
    lintDuringBuild: false,
    eslintOptions: eslintOptions(options, defaultCacheLocation),
    reportErrorsOnly,
    maxWarnings,
    formatter,
    outputFile,
    strict,
  })
    .then(async (lintResults) => {
      const lintOutput =
        typeof lintResults === 'string' ? lintResults : lintResults?.output

      if (typeof lintResults !== 'string' && lintResults?.eventInfo) {
        const telemetry = new Telemetry({
          distDir,
        })
        telemetry.record(
          eventLintCheckCompleted({
            ...lintResults.eventInfo,
            buildLint: false,
          })
        )
        await telemetry.flush()
      }

      if (
        typeof lintResults !== 'string' &&
        lintResults?.isError &&
        lintOutput
      ) {
        throw new CompileError(lintOutput)
      }

      if (lintOutput) {
        printAndExit(lintOutput, 0)
      } else if (lintResults && !lintOutput) {
        printAndExit(green('✔ No ESLint warnings or errors'), 0)
      } else {
        // this makes sure we exit 1 after the error from line 116
        // in packages/next/src/lib/eslint/runLintCheck
        process.exit(1)
      }
    })
    .catch((err) => {
      printAndExit(err.message)
    })
}

export { nextLint }
