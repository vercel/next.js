import chalk from 'chalk'
import { ESLint } from 'eslint'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

import { formatResults } from './eslint/customFormatter'
import * as log from '../build/output/log'

export async function verifyEslintSetup(
  baseDir: string,
  pagesDir: string,
  pagePath: string | null
) {
  try {
    let options: ESLint.Options

    if (pagePath && !existsSync(join(pagesDir, pagePath))) {
      return
    }

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

    const results = await eslint.lintFiles([
      pagePath ? join(pagesDir, pagePath) : `${pagesDir}/**/*.{js,tsx}`,
    ])
    const errors = ESLint.getErrorResults(results)

    if (errors?.length && !pagePath) {
      //Only throw errors during build when all page files are linted
      throw new Error(formatResults(baseDir, results))
    } else if (results?.length) {
      // No errors, or in dev mode when single files are linted
      console.log(formatResults(baseDir, results))
    }
  } catch (err) {
    console.error(chalk.red('Failed to compile.'))
    console.error(err.message)
    process.exit(1)
  }
}
