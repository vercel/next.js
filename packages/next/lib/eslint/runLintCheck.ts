import { promises as fs } from 'fs'
import chalk from 'chalk'
import path from 'path'

import findUp from 'next/dist/compiled/find-up'
import semver from 'next/dist/compiled/semver'
import * as CommentJson from 'next/dist/compiled/comment-json'

import { LintResult, formatResults } from './customFormatter'
import { writeDefaultConfig } from './writeDefaultConfig'
import { existsSync, findPagesDir } from '../find-pages-dir'
import {
  hasNecessaryDependencies,
  NecessaryDependencies,
} from '../has-necessary-dependencies'

import * as Log from '../../build/output/log'
import { EventLintCheckCompleted } from '../../telemetry/events/build'

type Config = {
  plugins: string[]
  rules: { [key: string]: Array<number | string> }
}

async function lint(
  deps: NecessaryDependencies,
  baseDir: string,
  lintDirs: string[],
  eslintrcFile: string | null,
  pkgJsonPath: string | null,
  eslintOptions: any = null,
  reportErrorsOnly: boolean = false,
  maxWarnings: number = -1
): Promise<
  | string
  | null
  | {
      output: string | null
      isError: boolean
      eventInfo: EventLintCheckCompleted
    }
> {
  // Load ESLint after we're sure it exists:
  const mod = await import(deps.resolved.get('eslint')!)

  const { ESLint } = mod
  let eslintVersion = ESLint?.version

  if (!ESLint) {
    eslintVersion = mod?.CLIEngine?.version

    if (!eslintVersion || semver.lt(eslintVersion, '7.0.0')) {
      return `${chalk.red(
        'error'
      )} - Your project has an older version of ESLint installed${
        eslintVersion ? ' (' + eslintVersion + ')' : ''
      }. Please upgrade to ESLint version 7 or later`
    }

    return `${chalk.red(
      'error'
    )} - ESLint class not found. Please upgrade to ESLint version 7 or later`
  }
  let options: any = {
    useEslintrc: true,
    baseConfig: {},
    errorOnUnmatchedPattern: false,
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    ...eslintOptions,
  }
  let eslint = new ESLint(options)

  let nextEslintPluginIsEnabled = false
  const pagesDirRules = ['@next/next/no-html-link-for-pages']

  for (const configFile of [eslintrcFile, pkgJsonPath]) {
    if (!configFile) continue

    const completeConfig: Config = await eslint.calculateConfigForFile(
      configFile
    )

    if (completeConfig.plugins?.includes('@next/next')) {
      nextEslintPluginIsEnabled = true
      break
    }
  }

  const pagesDir = findPagesDir(baseDir)

  if (nextEslintPluginIsEnabled) {
    let updatedPagesDir = false

    for (const rule of pagesDirRules) {
      if (
        !options.baseConfig!.rules?.[rule] &&
        !options.baseConfig!.rules?.[
          rule.replace('@next/next', '@next/babel-plugin-next')
        ]
      ) {
        if (!options.baseConfig!.rules) {
          options.baseConfig!.rules = {}
        }
        options.baseConfig!.rules[rule] = [1, pagesDir]
        updatedPagesDir = true
      }
    }

    if (updatedPagesDir) {
      eslint = new ESLint(options)
    }
  }
  const lintStart = process.hrtime()

  let results = await eslint.lintFiles(lintDirs)
  if (options.fix) await ESLint.outputFixes(results)
  if (reportErrorsOnly) results = await ESLint.getErrorResults(results) // Only return errors if --quiet flag is used

  const formattedResult = formatResults(baseDir, results)
  const lintEnd = process.hrtime(lintStart)
  const totalWarnings = results.reduce(
    (sum: number, file: LintResult) => sum + file.warningCount,
    0
  )

  return {
    output: formattedResult.output,
    isError:
      ESLint.getErrorResults(results)?.length > 0 ||
      (maxWarnings >= 0 && totalWarnings > maxWarnings),
    eventInfo: {
      durationInSeconds: lintEnd[0],
      eslintVersion: eslintVersion,
      lintedFilesCount: results.length,
      lintFix: !!options.fix,
      nextEslintPluginVersion: nextEslintPluginIsEnabled
        ? require(path.join(
            path.dirname(deps.resolved.get('eslint-config-next')!),
            'package.json'
          )).version
        : null,
      nextEslintPluginErrorsCount: formattedResult.totalNextPluginErrorCount,
      nextEslintPluginWarningsCount:
        formattedResult.totalNextPluginWarningCount,
    },
  }
}

export async function runLintCheck(
  baseDir: string,
  lintDirs: string[],
  lintDuringBuild: boolean = false,
  eslintOptions: any = null,
  reportErrorsOnly: boolean = false,
  maxWarnings: number = -1
): ReturnType<typeof lint> {
  try {
    // Find user's .eslintrc file
    const eslintrcFile =
      (await findUp(
        [
          '.eslintrc.js',
          '.eslintrc.yaml',
          '.eslintrc.yml',
          '.eslintrc.json',
          '.eslintrc',
        ],
        {
          cwd: baseDir,
        }
      )) ?? null

    const pkgJsonPath = (await findUp('package.json', { cwd: baseDir })) ?? null
    let packageJsonConfig = null
    if (pkgJsonPath) {
      const pkgJsonContent = await fs.readFile(pkgJsonPath, {
        encoding: 'utf8',
      })
      packageJsonConfig = CommentJson.parse(pkgJsonContent)
    }

    // Warning displayed if no ESLint configuration is present during build
    if (lintDuringBuild && !eslintrcFile && !packageJsonConfig.eslintConfig) {
      Log.warn(
        `No ESLint configuration detected. Run ${chalk.bold.cyan(
          'next lint'
        )} to begin setup`
      )
      return null
    }

    // Ensure ESLint and necessary plugins and configs are installed:
    const deps: NecessaryDependencies = await hasNecessaryDependencies(
      baseDir,
      false,
      true,
      lintDuringBuild
    )

    // Write default ESLint config if none is present
    // Check for /pages and src/pages is to make sure this happens in Next.js folder
    if (
      existsSync(path.join(baseDir, 'pages')) ||
      existsSync(path.join(baseDir, 'src/pages'))
    ) {
      await writeDefaultConfig(eslintrcFile, pkgJsonPath, packageJsonConfig)
    }

    // Run ESLint
    return await lint(
      deps,
      baseDir,
      lintDirs,
      eslintrcFile,
      pkgJsonPath,
      eslintOptions,
      reportErrorsOnly,
      maxWarnings
    )
  } catch (err) {
    throw err
  }
}
