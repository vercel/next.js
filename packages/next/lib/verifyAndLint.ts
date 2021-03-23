import { ESLint } from 'eslint'
import { join } from 'path'

import { formatResults } from './eslint/customFormatter'
import { fileExists } from './file-exists'
import * as log from '../build/output/log'

import findUp from 'next/dist/compiled/find-up'

type Config = {
  plugins: string[]
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

  if (eslintrcFile) {
    options = {
      useEslintrc: true,
    }
  } else {
    const pkgJsonPath = await findUp('package.json', { cwd: baseDir })
    const { eslintConfig = null } = !!pkgJsonPath
      ? await import(pkgJsonPath!)
      : {}

    if (!eslintConfig) {
      console.log()
      log.info(
        'No ESLint configuration was detected, but checks from the Next.js ESLint plugin were included automatically (see https://nextjs.org/docs/basic-features/eslint).'
      )
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

  const eslint = new ESLint(options)

  if (eslintrcFile) {
    const completeConfig: Config = await eslint.calculateConfigForFile(
      eslintrcFile
    )

    if (!completeConfig.plugins?.includes('@next/next')) {
      console.log()
      log.warn(
        `The Next.js ESLint plugin was not detected in ${eslintrcFile}. We recommend including it to prevent significant issues in your application (see https://nextjs.org/docs/basic-features/eslint).`
      )
    }
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
