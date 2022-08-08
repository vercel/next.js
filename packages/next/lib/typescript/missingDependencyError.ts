import chalk from 'next/dist/compiled/chalk'

import { getOxfordCommaList } from '../oxford-comma-list'
import { MissingDependency } from '../has-necessary-dependencies'
import { FatalError } from '../fatal-error'
import { getPkgManager } from '../helpers/get-pkg-manager'

export async function missingDepsError(
  dir: string,
  missingPackages: MissingDependency[]
) {
  const packagesHuman = getOxfordCommaList(missingPackages.map((p) => p.pkg))
  const packagesCli = missingPackages.map((p) => p.pkg).join(' ')
  const packageManager = getPkgManager(dir)

  const removalMsg =
    '\n\n' +
    chalk.bold(
      'If you are not trying to use TypeScript, please remove the ' +
        chalk.cyan('tsconfig.json') +
        ' file from your package root (and any TypeScript files in your pages directory).'
    )

  throw new FatalError(
    chalk.bold.red(
      `It looks like you're trying to use TypeScript but do not have the required package(s) installed.`
    ) +
      '\n\n' +
      chalk.bold(`Please install ${chalk.bold(packagesHuman)} by running:`) +
      '\n\n' +
      `\t${chalk.bold.cyan(
        (packageManager === 'yarn'
          ? 'yarn add --dev'
          : packageManager === 'pnpm'
          ? 'pnpm install --save-dev'
          : 'npm install --save-dev') +
          ' ' +
          packagesCli
      )}` +
      removalMsg +
      '\n'
  )
}
