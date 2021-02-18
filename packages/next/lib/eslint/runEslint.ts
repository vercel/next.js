import { formatResults } from './customFormatter'
import { ESLint } from 'eslint'
import { readdirSync } from 'fs'

export interface EslintResult {
  results?: ESLint.LintResult[]
}

export async function runEslint(
  baseDir: string,
  pagesDir: string,
  errorsEnabled: boolean
): Promise<EslintResult> {
  let options: ESLint.Options

  const dirFiles = readdirSync(baseDir)
  const eslintrc = dirFiles.find((file) =>
    /^.eslintrc.?(js|json|yaml|yml)?$/.test(file)
  )

  if (!eslintrc) {
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
  } else {
    options = {
      useEslintrc: true,
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
