import chalk from 'chalk'
import { runEslint } from './eslint/runEslint'
import { readdirSync } from 'fs'

export async function verifyEslintSetup(
  dir: string,
  pagesDir: string,
  errorsEnabled: boolean
) {
  const eslintrcFile = readdirSync(dir).find((file) =>
    /^.eslintrc.?(js|json|yaml|yml)?$/.test(file)
  )

  try {
    return await runEslint(dir, pagesDir, errorsEnabled, eslintrcFile)
  } catch (err) {
    console.error(chalk.red('Failed to compile.'))
    console.error(err.message)
    process.exit(1)
  }
}
