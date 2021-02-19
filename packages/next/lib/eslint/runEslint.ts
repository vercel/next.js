import * as log from '../../build/output/log'
import { formatResults } from './customFormatter'
import { ESLint } from 'eslint'
import { readFileSync } from 'fs'

export interface EslintResult {
  results?: ESLint.LintResult[]
}

export async function runEslint(
  baseDir: string,
  pagesDir: string,
  errorsEnabled: boolean,
  eslintrcFile?: string
): Promise<EslintResult> {
  let options: ESLint.Options

  if (eslintrcFile) {
    const eslintConfig = readFileSync(`${baseDir}/${eslintrcFile}`).toString()

    if (!eslintConfig.includes('@next/next')) {
      log.warn(
        `The Next.js ESLint plugin was not detected in ${eslintrcFile}. We recommend including it to prevent significant issues in your application (see https://nextjs.org/docs/linting).`
      )
    }

    options = {
      useEslintrc: true,
    }
  } else {
    log.info(
      'No ESLint configuration file was detected, but checks from the Next.js ESLint plugin were included automatically (see https://nextjs.org/docs/linting).'
    )

    options = {
      baseConfig: {
        extends: ['plugin:@next/next/recommended'],
        parserOptions: {
          ecmaVersion: 2018,
          sourceType: 'module',
          ecmaFeatures: {
            jsx: true,
            modules: true,
          },
        },
      },
      useEslintrc: false,
    }
  }

  const eslint = new ESLint(options)

  const results = await eslint.lintFiles([`${pagesDir}/**/*.{js,tsx}`])
  const errors = ESLint.getErrorResults(results)

  if (errors?.length && errorsEnabled) {
    // Errors present
    throw new Error(formatResults(baseDir, results))
  } else if (results?.length) {
    // No errors, but warnings present
    console.log(formatResults(baseDir, results))
  }

  return { results }
}
