import chalk from 'chalk'
import path from 'path'

import { fileExists } from './file-exists'
import { getOxfordCommaList } from './oxford-comma-list'
import { FatalError } from './fatal-error'

const requiredTSPackages = [
  { file: 'typescript', pkg: 'typescript' },
  { file: '@types/react/index.d.ts', pkg: '@types/react' },
  { file: '@types/node/index.d.ts', pkg: '@types/node' },
]

const requiredLintPackages = [
  { file: 'eslint/lib/api.js', pkg: 'eslint' },
  { file: 'eslint-config-next', pkg: 'eslint-config-next' },
]

export type NecessaryDependencies = {
  resolved: string
}

export async function hasNecessaryDependencies(
  baseDir: string,
  checkTSDeps: boolean,
  checkESLintDeps: boolean,
  eslintrcFile: string | null = null
): Promise<NecessaryDependencies> {
  if (!checkTSDeps && !checkESLintDeps) {
    return { resolved: undefined! }
  }

  let resolutions = new Map<string, string>()
  let requiredPackages = checkESLintDeps
    ? requiredLintPackages
    : requiredTSPackages

  const missingPackages = requiredPackages.filter((p) => {
    try {
      resolutions.set(p.pkg, require.resolve(p.file, { paths: [baseDir] }))
      return false
    } catch (_) {
      return true
    }
  })

  if (missingPackages.length < 1) {
    return {
      resolved: checkESLintDeps
        ? resolutions.get('eslint')!
        : resolutions.get('typescript')!,
    }
  }

  const packagesHuman = getOxfordCommaList(missingPackages.map((p) => p.pkg))
  const packagesCli = missingPackages.map((p) => p.pkg).join(' ')

  const yarnLockFile = path.join(baseDir, 'yarn.lock')
  const isYarn = await fileExists(yarnLockFile).catch(() => false)
  const removalMsg = checkTSDeps
    ? chalk.bold(
        'If you are not trying to use TypeScript, please remove the ' +
          chalk.cyan('tsconfig.json') +
          ' file from your package root (and any TypeScript files in your pages directory).'
      )
    : chalk.bold(
        `If you are not trying to use ESLint, please remove the ${
          eslintrcFile
            ? chalk.cyan(path.basename(eslintrcFile)) +
              ' file from your application'
            : chalk.cyan('eslintConfig') + ' field from your package.json file'
        }.`
      )

  throw new FatalError(
    chalk.bold.red(
      `It looks like you're trying to use ${
        checkTSDeps ? 'TypeScript' : 'ESLint'
      } but do not have the required package(s) installed.`
    ) +
      '\n\n' +
      chalk.bold(`Please install ${chalk.bold(packagesHuman)} by running:`) +
      '\n\n' +
      `\t${chalk.bold.cyan(
        (isYarn ? 'yarn add --dev' : 'npm install --save-dev') +
          ' ' +
          packagesCli
      )}` +
      '\n\n' +
      removalMsg +
      '\n'
  )
}
