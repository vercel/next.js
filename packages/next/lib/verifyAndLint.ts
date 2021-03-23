import { ESLint } from 'eslint'
import { join } from 'path'

import { formatResults } from './eslint/customFormatter'
import { fileExists } from './file-exists'
import * as log from '../build/output/log'

import findUp from 'next/dist/compiled/find-up'

type Config = {
  plugins: string[]
  rules: { [key: string]: Array<number | string> }
}

export async function verifyAndLint(
  baseDir: string,
  pagesDir: string,
  pagePath: string | null
): Promise<{
  results: string
  hasErrors: boolean
  hasMessages: boolean
}> {
  let options: ESLint.Options

  let pathNotExists = Boolean(
    pagePath && !(await fileExists(join(pagesDir, pagePath)))
  )

  if (pathNotExists)
    return { results: '', hasErrors: false, hasMessages: false }

  const eslintrcFile = await findUp(
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
  )

  const pagesDirRules = ['@next/next/no-html-link-for-pages']
  const pkgJsonPath = await findUp('package.json', { cwd: baseDir })
  const { eslintConfig = null } = !!pkgJsonPath
    ? await import(pkgJsonPath!)
    : {}
  let pluginIsEnabled = false

  if (eslintrcFile) {
    options = {
      useEslintrc: true,
      baseConfig: {},
    }
  } else {
    if (!eslintConfig) {
      console.log()
      log.info(
        'No ESLint configuration was detected, but checks from the Next.js ESLint plugin were included automatically (see https://nextjs.org/docs/basic-features/eslint).'
      )
      pluginIsEnabled = true
    }

    options = {
      baseConfig: eslintConfig ?? {
        extends: ['plugin:@next/next/recommended'],
        parser: require.resolve('@babel/eslint-parser'),
        parserOptions: {
          requireConfigFile: false,
          sourceType: 'module',
          babelOptions: {
            presets: ['next/babel'],
          },
        },
      },
      useEslintrc: false,
    }
  }

  let eslint = new ESLint(options)

  // check both eslintrc and package.json config since
  // eslint will load config from both
  for (const configFile of [eslintrcFile, pkgJsonPath]) {
    if (!configFile) continue

    const completeConfig: Config = await eslint.calculateConfigForFile(
      configFile
    )

    if (completeConfig.plugins?.includes('@next/next')) {
      pluginIsEnabled = true
      break
    }
  }

  if (pluginIsEnabled) {
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
    console.log()
    log.warn(
      `The Next.js ESLint plugin was not detected in ${
        eslintrcFile || pkgJsonPath
      }. We recommend including it to prevent significant issues in your application (see https://nextjs.org/docs/basic-features/eslint).`
    )
  }

  const results = await eslint.lintFiles([
    pagePath ? join(pagesDir, pagePath) : `${pagesDir}/**/*.{js,tsx}`,
  ])

  const errors = ESLint.getErrorResults(results)

  return {
    results: formatResults(baseDir, results),
    hasErrors: errors?.length > 0 && !pagePath,
    hasMessages: results?.length > 0,
  }
}
