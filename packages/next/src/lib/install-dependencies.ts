import { cyan } from './picocolors'
import path from 'path'

import type { MissingDependency } from './has-necessary-dependencies'
import { getPkgManager } from './helpers/get-pkg-manager'
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
  const packageManager = getPkgManager(baseDir)
  const isOnline = await getOnline()

  if (deps.length) {
    console.log()
    console.log(
      `Installing ${
        dev ? 'devDependencies' : 'dependencies'
      } (${packageManager}):`
    )
    for (const dep of deps) {
      console.log(`- ${cyan(dep.pkg)}`)
    }
    console.log()

    await install(
      path.resolve(baseDir),
      deps.map((dep: MissingDependency) => dep.pkg),
      { devDependencies: dev, isOnline, packageManager }
    )
    console.log()
  }
}
