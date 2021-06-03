import { promises as fs } from 'fs'
import chalk from 'chalk'

import findUp from 'next/dist/compiled/find-up'
import semver from 'next/dist/compiled/semver'
import * as CommentJson from 'next/dist/compiled/comment-json'

import { formatResults } from './customFormatter'
import { writeDefaultConfig } from './writeDefaultConfig'
import { getPackageVersion } from '../get-package-version'
import { findPagesDir } from '../find-pages-dir'

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

const linteableFiles = (dir: string) => {
  return `${dir}/**/*.{${['jsx', 'js', 'ts', 'tsx'].join(',')}}`
}

async function lint(
  deps: NecessaryDependencies,
  baseDir: string,
  lintDirs: string[] | null,
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
      Log.error(
        `Your project has an older version of ESLint installed (${eslintVersion}). Please upgrade to v7 or later`
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

  // If no directories to lint are provided, only the pages directory will be linted
  const filesToLint = lintDirs
    ? lintDirs.map(linteableFiles)
    : linteableFiles(pagesDir)

  const results = await eslint.lintFiles(filesToLint)

  if (ESLint.getErrorResults(results)?.length > 0) {
    throw new CompileError(await formatResults(baseDir, results))
  }
  return results?.length > 0 ? formatResults(baseDir, results) : null
}

export async function runLintCheck(
  baseDir: string,
  lintDirs: string[] | null,
  lintDuringBuild: boolean = false
): Promise<string | null> {
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
      eslintrcFile ?? '',
      !!packageJsonConfig.eslintConfig,
      lintDuringBuild
    )

    // Write default ESLint config if none is present
    await writeDefaultConfig(eslintrcFile, pkgJsonPath, packageJsonConfig)

    // Run ESLint
    return await lint(deps, baseDir, lintDirs, eslintrcFile, pkgJsonPath)
  } catch (err) {
    throw err
  }
}
