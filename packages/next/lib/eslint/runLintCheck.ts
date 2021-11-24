import { promises } from 'fs'
import { extname } from 'path'

import findUp from 'next/dist/compiled/find-up'
import semver from 'next/dist/compiled/semver'

import { formatResults } from './customFormatter'
import { getLintIntent } from './getLintIntent'
import { writeDefaultConfig } from './writeDefaultConfig'
import { getPackageVersion } from '../get-package-version'

import { CompileError } from '../compile-error'
import {
  hasNecessaryDependencies,
  NecessaryDependencies,
} from '../has-necessary-dependencies'

import * as Log from '../../build/output/log'

type Config = {
  plugins: string[]
  rules: { [key: string]: Array<number | string> }
}

const linteableFileTypes = ['jsx', 'js', 'ts', 'tsx']

async function lint(
  deps: NecessaryDependencies,
  baseDir: string,
  pagesDir: string,
  eslintrcFile: string | null,
  pkgJsonPath: string | null
): Promise<string | null> {
  // Load ESLint after we're sure it exists:
  const { ESLint } = await import(deps.resolved)

  if (!ESLint) {
    const eslintVersion: string | null = await getPackageVersion({
      cwd: baseDir,
      name: 'eslint',
    })

    if (eslintVersion && semver.lt(eslintVersion, '7.0.0')) {
      Log.warn(
        `Your project has an older version of ESLint installed (${eslintVersion}). Please upgrade to v7 or later to run ESLint during the build process.`
      )
    }
    return null
  }

  let options: any = {
    useEslintrc: true,
    baseConfig: {},
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

  const results = await eslint.lintFiles([
    `${pagesDir}/**/*.{${linteableFileTypes.join(',')}}`,
  ])

  if (ESLint.getErrorResults(results)?.length > 0) {
    throw new CompileError(await formatResults(baseDir, results))
  }
  return results?.length > 0 ? formatResults(baseDir, results) : null
}

export async function runLintCheck(
  baseDir: string,
  pagesDir: string
): Promise<string | null> {
  try {
    // Check if any pages exist that can be linted
    const pages = await promises.readdir(pagesDir)
    if (
      !pages.some((page) =>
        linteableFileTypes.includes(extname(page).replace('.', ''))
      )
    ) {
      return null
    }

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

    const { eslintConfig: pkgJsonEslintConfig = null } = !!pkgJsonPath
      ? await import(pkgJsonPath!)
      : {}

    // Check if the project uses ESLint
    const eslintIntent = await getLintIntent(eslintrcFile, pkgJsonEslintConfig)

    if (!eslintIntent) {
      return null
    }

    const firstTimeSetup = eslintIntent.firstTimeSetup

    // Ensure ESLint and necessary plugins and configs are installed:
    const deps: NecessaryDependencies = await hasNecessaryDependencies(
      baseDir,
      false,
      !!eslintIntent,
      eslintrcFile
    )

    // Create the user's eslintrc config for them
    if (firstTimeSetup) await writeDefaultConfig(eslintrcFile, pkgJsonPath)

    // Run ESLint
    return await lint(deps, baseDir, pagesDir, eslintrcFile, pkgJsonPath)
  } catch (err) {
    throw err
  }
}
