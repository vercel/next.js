import chalk from 'chalk'
import path from 'path'
import { fileExists } from '../file-exists'
import { getOxfordCommaList } from '../oxford-comma-list'
import { resolveRequest } from '../resolve-request'
import { FatalTypeScriptError } from './FatalTypeScriptError'

const requiredPackages = [
  { file: 'typescript', pkg: 'typescript' },
  { file: '@types/react/index.d.ts', pkg: '@types/react' },
  { file: '@types/node/index.d.ts', pkg: '@types/node' },
]

export type NecessaryDependencies = {
  resolvedTypeScript: string
}

export async function hasNecessaryDependencies(
  baseDir: string
): Promise<NecessaryDependencies> {
  let resolutions = new Map<string, string>()

  const missingPackages = requiredPackages.filter((p) => {
    try {
      resolutions.set(p.pkg, resolveRequest(p.file, path.join(baseDir, '/')))
      return false
    } catch (_) {
      return true
    }
  })

  if (missingPackages.length < 1) {
    return { resolvedTypeScript: resolutions.get('typescript')! }
  }

  const packagesHuman = getOxfordCommaList(missingPackages.map((p) => p.pkg))
  const packagesCli = missingPackages.map((p) => p.pkg).join(' ')

  const yarnLockFile = path.join(baseDir, 'yarn.lock')
  const isYarn = await fileExists(yarnLockFile).catch(() => false)

  throw new FatalTypeScriptError(
    chalk.bold.red(
      `It looks like you're trying to use TypeScript but do not have the required package(s) installed.`
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
      chalk.bold(
        'If you are not trying to use TypeScript, please remove the ' +
          chalk.cyan('tsconfig.json') +
          ' file from your package root (and any TypeScript files in your pages directory).'
      ) +
      '\n'
  )
}
