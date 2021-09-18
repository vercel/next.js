import chalk from 'chalk'
import path from 'path'

import { MissingDependency } from './has-necessary-dependencies'
import { shouldUseYarn } from './helpers/should-use-yarn'
import { install } from './helpers/install'
import { getOnline } from './helpers/get-online'

export type Dependencies = {
  resolved: Map<string, string>
}

export async function installDependencies(
  baseDir: string,
  deps: any,
  dev: boolean = false
) {
  const useYarn = shouldUseYarn()
  const isOnline = !useYarn || (await getOnline())

  if (deps.length) {
    console.log()
    console.log(`Installing ${dev ? 'devDependencies' : 'dependencies'}:`)
    for (const dep of deps) {
      console.log(`- ${chalk.cyan(dep.pkg)}`)
    }
    console.log()

    const devInstallFlags = { devDependencies: dev, ...{ useYarn, isOnline } }
    await install(
      path.resolve(baseDir),
      deps.map((dep: MissingDependency) => dep.pkg),
      devInstallFlags
    )
    console.log()
  }
}
