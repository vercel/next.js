import * as log from '../../build/output/log'
import { formatResults } from './customFormatter'
import { ESLint } from 'eslint'
import { readFileSync, readdirSync } from 'fs'

export interface EslintResult {
  results?: ESLint.LintResult[]
}

export async function runEslint(
  baseDir: string,
  pagesDir: string,
  dev: boolean
): Promise<EslintResult> {
  let options: ESLint.Options

  const eslintrcFile = readdirSync(baseDir).find((file) =>
    /^.eslintrc.?(js|json|yaml|yml)?$/.test(file)
  )

  if (eslintrcFile) {
    const config = readFileSync(`${baseDir}/${eslintrcFile}`).toString()

    if (!config.includes('@next/next')) {
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

  if (errors?.length && !dev) {
    // Errors present (only throw during build)
    throw new Error(formatResults(baseDir, results))
  } else if (results?.length) {
    // No errors, or in dev mode
    console.log(formatResults(baseDir, results))
  }

  return { results }
}
