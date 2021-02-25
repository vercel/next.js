import chalk from 'chalk'
import { ESLint } from 'eslint'
import { promises } from 'fs'
import { join } from 'path'

import * as log from '../build/output/log'

import { formatResults } from './eslint/customFormatter'
import { fileExists } from './file-exists'
import findUp from 'next/dist/compiled/find-up'

type Config = {
  plugins: string[]
}

export async function verifyEslintSetup(
  baseDir: string,
  pagesDir: string,
  pagePath: string | null
) {
  try {
    let options: ESLint.Options

    let pathNotExists = Boolean(
      pagePath && !(await fileExists(join(pagesDir, pagePath)))
    )

    if (pathNotExists) return

    const dirResults = await promises.readdir(baseDir)
    const eslintrcFile = dirResults.find((file: string) =>
      /^.eslintrc.?(js|json|yaml|yml)?$/.test(file)
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
        log.info(
          'No ESLint configuration was detected, but checks from the Next.js ESLint plugin were included automatically (see https://nextjs.org/docs/basic-features/eslint).'
        )
      }

      options = {
        baseConfig: eslintConfig ?? {
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

    if (eslintrcFile) {
      const completeConfig: Config = await eslint.calculateConfigForFile(
        eslintrcFile
      )

      if (!completeConfig.plugins?.includes('@next/next')) {
        log.warn(
          `The Next.js ESLint plugin was not detected in ${eslintrcFile}. We recommend including it to prevent significant issues in your application (see https://nextjs.org/docs/basic-features/eslint).`
        )
      }
    }

    const results = await eslint.lintFiles([
      pagePath ? join(pagesDir, pagePath) : `${pagesDir}/**/*.{js,tsx}`,
    ])

    const errors = ESLint.getErrorResults(results)

    if (errors?.length && !pagePath) {
      //Only throw errors during build (when all page files are linted)
      throw new Error(formatResults(baseDir, results))
    } else if (results?.length) {
      // No errors, or in dev mode (when single files are linted)
      console.log(formatResults(baseDir, results))
    }
  } catch (err) {
    console.error(chalk.red('Failed to compile.'))
    console.error(err.message)
    process.exit(1)
  }
}
