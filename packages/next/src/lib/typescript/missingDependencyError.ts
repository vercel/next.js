import { bold, cyan, red } from '../picocolors'

import { getOxfordCommaList } from '../oxford-comma-list'
import type { MissingDependency } from '../has-necessary-dependencies'
import { FatalError } from '../fatal-error'
import { getPkgManager } from '../helpers/get-pkg-manager'

export function missingDepsError(
  dir: string,
  missingPackages: MissingDependency[]
): never {
  const packagesHuman = getOxfordCommaList(missingPackages.map((p) => p.pkg))
  const packagesCli = missingPackages.map((p) => p.pkg).join(' ')
  const packageManager = getPkgManager(dir)

  const removalMsg =
    '\n\n' +
    bold(
      'If you are not trying to use TypeScript, please remove the ' +
        cyan('tsconfig.json') +
        ' file from your package root (and any TypeScript files in your pages directory).'
    )

  throw new FatalError(
    bold(
      red(
        `It looks like you're trying to use TypeScript but do not have the required package(s) installed.`
      )
    ) +
      '\n\n' +
      bold(`Please install ${bold(packagesHuman)} by running:`) +
      '\n\n' +
      `\t${bold(
        cyan(
          (packageManager === 'yarn'
            ? 'yarn add --dev'
            : packageManager === 'pnpm'
            ? 'pnpm install --save-dev'
            : 'npm install --save-dev') +
            ' ' +
            packagesCli
        )
      )}` +
      removalMsg +
      '\n'
  )
}
