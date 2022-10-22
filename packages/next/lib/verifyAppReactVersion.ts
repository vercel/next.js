import chalk from 'next/dist/compiled/chalk'

import {
  hasNecessaryDependencies,
  MissingDependency,
  NecessaryDependencies,
} from './has-necessary-dependencies'

import { installDependencies } from './install-dependencies'
import { isCI } from '../telemetry/ci-info'
import { FatalError } from './fatal-error'
import { getPkgManager } from './helpers/get-pkg-manager'
import { getOxfordCommaList } from './oxford-comma-list'
const requiredReactVersion = process.env.REQUIRED_APP_REACT_VERSION || ''

const removalMsg =
  '\n\n' +
  chalk.bold(
    'If you are not trying to use the `app` directory, please disable the ' +
      chalk.cyan('experimental.appDir') +
      ' config in your `next.config.js`.'
  )

const requiredPackages = [
  {
    file: 'react/index.js',
    pkg: 'react',
    exportsRestrict: true,
  },
  {
    file: 'react-dom/index.js',
    pkg: 'react-dom',
    exportsRestrict: true,
  },
]

async function missingDepsError(
  dir: string,
  missingPackages: MissingDependency[]
) {
  const packagesHuman = getOxfordCommaList(missingPackages.map((p) => p.pkg))
  const packagesCli = missingPackages
    .map((p) => `${p.pkg}@${requiredReactVersion}`)
    .join(' ')
  const packageManager = getPkgManager(dir)

  throw new FatalError(
    chalk.bold.red(
      `It looks like you're trying to use the \`app\` directory but do not have the required react version installed.`
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

export async function verifyAppReactVersion({
  dir,
}: {
  dir: string
}): Promise<void> {
  if (process.env.NEXT_SKIP_APP_REACT_INSTALL) {
    return
  }

  // Ensure TypeScript and necessary `@types/*` are installed:
  let deps: NecessaryDependencies = await hasNecessaryDependencies(
    dir,
    requiredPackages
  )
  const resolvedReact = deps.resolved.get('react')
  const installedVersion =
    resolvedReact &&
    require(deps.resolved.get('react') || '')
      .version?.split('-experimental')
      .pop()

  if (
    deps.missing?.length ||
    installedVersion !== requiredReactVersion.split('-experimental').pop()
  ) {
    const neededDeps = requiredPackages.map((dep) => {
      dep.pkg = `${dep.pkg}@${requiredReactVersion}`
      return dep
    })

    if (isCI) {
      // we don't attempt auto install in CI to avoid side-effects
      // and instead log the error for installing needed packages
      await missingDepsError(dir, neededDeps)
    }
    console.log(
      chalk.bold.yellow(
        `It looks like you're trying to use \`app\` directory but do not have the required react version installed.`
      ) +
        '\n' +
        removalMsg +
        '\n'
    )
    await installDependencies(dir, neededDeps, true).catch((err) => {
      if (err && typeof err === 'object' && 'command' in err) {
        console.error(
          `\nFailed to install required react versions, please install them manually to continue:\n` +
            (err as any).command +
            '\n'
        )
      }
      process.exit(1)
    })
  }
}
