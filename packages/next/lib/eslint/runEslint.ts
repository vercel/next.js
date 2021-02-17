import { formatResults } from './customFormatter'
import { ESLint } from 'eslint'

export interface EslintResult {
  results?: ESLint.LintResult[]
}

export async function runEslint(
  baseDir: string,
  pagesDir: string
): Promise<EslintResult> {
  const eslint = new ESLint({ useEslintrc: true })

  const results = await eslint.lintFiles([`${pagesDir}/**/*.{js,tsx}`])
  const errors = ESLint.getErrorResults(results)

  if (errors?.length) {
    // Errors present
    throw new Error(formatResults(baseDir, results))
  } else if (results?.length) {
    // No errors, but warnings present
    console.log(formatResults(baseDir, results))
  }

  return { results }
}
