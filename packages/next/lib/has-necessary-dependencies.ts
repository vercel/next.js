import chalk from 'chalk'
import { basename, join } from 'path'

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
  eslintrcFile: string = '',
  pkgJsonEslintConfig: boolean = false,
  lintDuringBuild: boolean = false
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

  const yarnLockFile = join(baseDir, 'yarn.lock')
  const isYarn = await fileExists(yarnLockFile).catch(() => false)

  const removalTSMsg =
    '\n\n' +
    chalk.bold(
      'If you are not trying to use TypeScript, please remove the ' +
        chalk.cyan('tsconfig.json') +
        ' file from your package root (and any TypeScript files in your pages directory).'
    )
  const removalLintMsg =
    `\n\n` +
    (lintDuringBuild
      ? `If you do not want to run ESLint during builds, run ${chalk.bold.cyan(
          'next build --no-lint'
        )}` +
        (!!eslintrcFile
          ? ` or remove the ${chalk.bold(
              basename(eslintrcFile)
            )} file from your package root.`
          : pkgJsonEslintConfig
          ? ` or remove the ${chalk.bold(
              'eslintConfig'
            )} field from package.json.`
          : '')
      : `Once installed, run ${chalk.bold.cyan('next lint')} again.`)
  const removalMsg = checkTSDeps ? removalTSMsg : removalLintMsg

  throw new FatalError(
    chalk.bold.red(
      checkTSDeps
        ? `It looks like you're trying to use TypeScript but do not have the required package(s) installed.`
        : `To use ESLint, additional required package(s) must be installed.`
    ) +
      '\n\n' +
      chalk.bold(`Please install ${chalk.bold(packagesHuman)} by running:`) +
      '\n\n' +
      `\t${chalk.bold.cyan(
        (isYarn ? 'yarn add --dev' : 'npm install --save-dev') +
          ' ' +
          packagesCli
      )}` +
      removalMsg +
      '\n'
  )
}
