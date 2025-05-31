import { promises as fs, existsSync } from 'fs'
import { bold, cyan, red, underline, yellow } from '../picocolors'
import path from 'path'

import findUp from 'next/dist/compiled/find-up'
import semver from 'next/dist/compiled/semver'
import * as CommentJson from 'next/dist/compiled/comment-json'

import { formatResults } from './customFormatter'
import type { LintResult } from './customFormatter'
import { writeDefaultConfig } from './writeDefaultConfig'
import { hasEslintConfiguration } from './hasEslintConfiguration'
import { writeOutputFile } from './writeOutputFile'

import { findPagesDir } from '../find-pages-dir'
import { installDependencies } from '../install-dependencies'
import { hasNecessaryDependencies } from '../has-necessary-dependencies'

import * as Log from '../../build/output/log'
import type { EventLintCheckCompleted } from '../../telemetry/events/build'
import isError, { getProperError } from '../is-error'
import { getPkgManager } from '../helpers/get-pkg-manager'
import {
  getESLintStrictValue,
  getESLintPromptValues,
} from './getESLintPromptValues'

type Config = {
  plugins: string[]
  rules: { [key: string]: Array<number | string> }
}

// 0 is off, 1 is warn, 2 is error. See https://eslint.org/docs/user-guide/configuring/rules#configuring-rules
const VALID_SEVERITY = ['off', 'warn', 'error'] as const
type Severity = (typeof VALID_SEVERITY)[number]

function isValidSeverity(severity: string): severity is Severity {
  return VALID_SEVERITY.includes(severity as Severity)
}

const requiredPackages = [
  { file: 'eslint', pkg: 'eslint', exportsRestrict: false },
  {
    file: 'eslint-config-next',
    pkg: 'eslint-config-next',
    exportsRestrict: false,
  },
]

async function cliPrompt(cwd: string): Promise<{ config?: any }> {
  console.log(
    bold(
      `${cyan(
        '?'
      )} How would you like to configure ESLint? https://nextjs.org/docs/app/api-reference/config/eslint`
    )
  )

  try {
    const cliSelect = (
      await Promise.resolve(require('next/dist/compiled/cli-select'))
    ).default
    const { value } = await cliSelect({
      values: await getESLintPromptValues(cwd),
      valueRenderer: (
        {
          title,
          recommended,
        }: { title: string; recommended?: boolean; config: any },
        selected: boolean
      ) => {
        const name = selected ? bold(underline(cyan(title))) : title
        return name + (recommended ? bold(yellow(' (recommended)')) : '')
      },
      selected: cyan('❯ '),
      unselected: '  ',
    })

    return { config: value?.config ?? null }
  } catch {
    return { config: null }
  }
}

async function lint(
  baseDir: string,
  lintDirs: string[],
  eslintrcFile: string | null,
  pkgJsonPath: string | null,
  {
    lintDuringBuild = false,
    eslintOptions = null,
    reportErrorsOnly = false,
    maxWarnings = -1,
    formatter = null,
    outputFile = null,
  }: {
    lintDuringBuild: boolean
    eslintOptions: any
    reportErrorsOnly: boolean
    maxWarnings: number
    formatter: string | null
    outputFile: string | null
  }
): Promise<
  | string
  | null
  | {
      output: string | null
      isError: boolean
      eventInfo: EventLintCheckCompleted
    }
> {
  try {
    // Load ESLint after we're sure it exists:
    const deps = await hasNecessaryDependencies(baseDir, requiredPackages)
    const packageManager = getPkgManager(baseDir)

    if (deps.missing.some((dep) => dep.pkg === 'eslint')) {
      Log.error(
        `ESLint must be installed${
          lintDuringBuild ? ' in order to run during builds:' : ':'
        } ${bold(
          cyan(
            (packageManager === 'yarn'
              ? 'yarn add --dev'
              : packageManager === 'pnpm'
                ? 'pnpm install --save-dev'
                : 'npm install --save-dev') + ' eslint'
          )
        )}`
      )
      return null
    }

    const mod = await Promise.resolve(require(deps.resolved.get('eslint')!))

    // If V9 config was found, use flat config, or else use legacy.
    const useFlatConfig = eslintrcFile
      ? // eslintrcFile is absolute path
        path.basename(eslintrcFile).startsWith('eslint.config.')
      : false

    let ESLint
    // loadESLint is >= 8.57.0
    // PR https://github.com/eslint/eslint/pull/18098
    // Release https://github.com/eslint/eslint/releases/tag/v8.57.0
    if ('loadESLint' in mod) {
      // By default, configType is `flat`. If `useFlatConfig` is false, the return value is `LegacyESLint`.
      // https://github.com/eslint/eslint/blob/1def4cdfab1f067c5089df8b36242cdf912b0eb6/lib/types/index.d.ts#L1609-L1613
      ESLint = await mod.loadESLint({
        useFlatConfig,
      })
    } else {
      // eslint < 8.57.0, use legacy ESLint
      ESLint = mod.ESLint
    }

    let eslintVersion = ESLint?.version ?? mod.CLIEngine?.version

    if (!eslintVersion || semver.lt(eslintVersion, '7.0.0')) {
      return `${red(
        'error'
      )} - Your project has an older version of ESLint installed${
        eslintVersion ? ' (' + eslintVersion + ')' : ''
      }. Please upgrade to ESLint version 7 or above`
    }

    let options: any = {
      useEslintrc: true,
      baseConfig: {},
      errorOnUnmatchedPattern: false,
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      cache: true,
      ...eslintOptions,
    }

    if (semver.gte(eslintVersion, '9.0.0') && useFlatConfig) {
      for (const option of [
        'useEslintrc',
        'extensions',
        'ignorePath',
        'reportUnusedDisableDirectives',
        'resolvePluginsRelativeTo',
        'rulePaths',
        'inlineConfig',
        'maxWarnings',
      ]) {
        if (option in options) {
          delete options[option]
        }
      }
    }

    let eslint = new ESLint(options)

    let nextEslintPluginIsEnabled = false
    const nextRulesEnabled = new Map<string, Severity>()

    for (const configFile of [eslintrcFile, pkgJsonPath]) {
      if (!configFile) continue

      const completeConfig: Config | undefined =
        await eslint.calculateConfigForFile(configFile)
      if (!completeConfig) continue

      const plugins = completeConfig.plugins

      const hasNextPlugin =
        // in ESLint < 9, `plugins` value is string[]
        Array.isArray(plugins)
          ? plugins.includes('@next/next')
          : // in ESLint >= 9, `plugins` value is Record<string, unknown>
            '@next/next' in plugins

      if (hasNextPlugin) {
        nextEslintPluginIsEnabled = true
        for (const [name, [severity]] of Object.entries(completeConfig.rules)) {
          if (!name.startsWith('@next/next/')) {
            continue
          }
          if (
            typeof severity === 'number' &&
            severity >= 0 &&
            severity < VALID_SEVERITY.length
          ) {
            nextRulesEnabled.set(name, VALID_SEVERITY[severity])
          } else if (
            typeof severity === 'string' &&
            isValidSeverity(severity)
          ) {
            nextRulesEnabled.set(name, severity)
          }
        }
        break
      }
    }

    const pagesDir = findPagesDir(baseDir).pagesDir
    const pagesDirRules = pagesDir ? ['@next/next/no-html-link-for-pages'] : []

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
    } else {
      Log.warn('')
      Log.warn(
        'The Next.js plugin was not detected in your ESLint configuration. See https://nextjs.org/docs/app/api-reference/config/eslint#migrating-existing-config'
      )
    }

    const lintStart = process.hrtime()

    let results = await eslint.lintFiles(lintDirs)
    let selectedFormatter = null

    if (options.fix) await ESLint.outputFixes(results)
    if (reportErrorsOnly) results = await ESLint.getErrorResults(results) // Only return errors if --quiet flag is used

    if (formatter) selectedFormatter = await eslint.loadFormatter(formatter)
    const formattedResult = await formatResults(
      baseDir,
      results,
      selectedFormatter?.format
    )
    const lintEnd = process.hrtime(lintStart)
    const totalWarnings = results.reduce(
      (sum: number, file: LintResult) => sum + file.warningCount,
      0
    )

    if (outputFile) await writeOutputFile(outputFile, formattedResult.output)

    return {
      output: formattedResult.outputWithMessages,
      isError:
        ESLint.getErrorResults(results)?.length > 0 ||
        (maxWarnings >= 0 && totalWarnings > maxWarnings),
      eventInfo: {
        durationInSeconds: lintEnd[0],
        eslintVersion: eslintVersion,
        lintedFilesCount: results.length,
        lintFix: !!options.fix,
        nextEslintPluginVersion:
          nextEslintPluginIsEnabled && deps.resolved.has('eslint-config-next')
            ? require(
                path.join(
                  path.dirname(deps.resolved.get('eslint-config-next')!),
                  'package.json'
                )
              ).version
            : null,
        nextEslintPluginErrorsCount: formattedResult.totalNextPluginErrorCount,
        nextEslintPluginWarningsCount:
          formattedResult.totalNextPluginWarningCount,
        nextRulesEnabled: Object.fromEntries(nextRulesEnabled),
      },
    }
  } catch (err) {
    if (lintDuringBuild) {
      Log.error(
        `ESLint: ${
          isError(err) && err.message ? err.message.replace(/\n/g, ' ') : err
        }`
      )
      return null
    } else {
      throw getProperError(err)
    }
  }
}

export async function runLintCheck(
  baseDir: string,
  lintDirs: string[],
  opts: {
    lintDuringBuild?: boolean
    eslintOptions?: any
    reportErrorsOnly?: boolean
    maxWarnings?: number
    formatter?: string | null
    outputFile?: string | null
    strict?: boolean
  }
): ReturnType<typeof lint> {
  const {
    lintDuringBuild = false,
    eslintOptions = null,
    reportErrorsOnly = false,
    maxWarnings = -1,
    formatter = null,
    outputFile = null,
    strict = false,
  } = opts
  try {
    // Find user's .eslintrc file
    // See: https://eslint.org/docs/user-guide/configuring/configuration-files#configuration-file-formats
    const eslintrcFile =
      (await findUp(
        [
          // eslint v9
          'eslint.config.js',
          'eslint.config.mjs',
          'eslint.config.cjs',
          // TS extensions require to install a separate package `jiti`.
          // https://eslint.org/docs/latest/use/configure/configuration-files#typescript-configuration-files
          'eslint.config.ts',
          'eslint.config.mts',
          'eslint.config.cts',
          // eslint <= v8
          '.eslintrc.js',
          '.eslintrc.cjs',
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

    const config = await hasEslintConfiguration(eslintrcFile, packageJsonConfig)
    let deps

    if (config.exists) {
      // Run if ESLint config exists
      return await lint(baseDir, lintDirs, eslintrcFile, pkgJsonPath, {
        lintDuringBuild,
        eslintOptions,
        reportErrorsOnly,
        maxWarnings,
        formatter,
        outputFile,
      })
    } else {
      // Display warning if no ESLint configuration is present inside
      // config file during "next build", no warning is shown when
      // no eslintrc file is present
      if (lintDuringBuild) {
        if (config.emptyPkgJsonConfig || config.emptyEslintrc) {
          Log.warn(
            `No ESLint configuration detected. Run ${bold(
              cyan('next lint')
            )} to begin setup`
          )
        }
        return null
      } else {
        // Ask user what config they would like to start with for first time "next lint" setup
        const { config: selectedConfig } = strict
          ? await getESLintStrictValue(baseDir)
          : await cliPrompt(baseDir)

        if (selectedConfig == null) {
          // Show a warning if no option is selected in prompt
          Log.warn(
            'If you set up ESLint yourself, we recommend adding the Next.js ESLint plugin. See https://nextjs.org/docs/app/api-reference/config/eslint#migrating-existing-config'
          )
          return null
        } else {
          // Check if necessary deps installed, and install any that are missing
          deps = await hasNecessaryDependencies(baseDir, requiredPackages)
          if (deps.missing.length > 0) {
            deps.missing.forEach((dep) => {
              if (dep.pkg === 'eslint') {
                // pin to v9 to avoid breaking changes
                dep.pkg = 'eslint@^9'
              }
            })

            await installDependencies(baseDir, deps.missing, true)
          }

          // Write default ESLint config.
          // Check for /pages and src/pages is to make sure this happens in Next.js folder
          if (
            ['app', 'src/app', 'pages', 'src/pages'].some((dir) =>
              existsSync(path.join(baseDir, dir))
            )
          ) {
            await writeDefaultConfig(
              baseDir,
              config,
              selectedConfig,
              eslintrcFile,
              pkgJsonPath,
              packageJsonConfig
            )
          }
        }

        Log.ready(
          `ESLint has successfully been configured. Run ${bold(
            cyan('next lint')
          )} again to view warnings and errors.`
        )

        return null
      }
    }
  } catch (err) {
    throw err
  }
}
