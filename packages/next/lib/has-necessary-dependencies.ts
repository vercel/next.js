import { existsSync } from 'fs'
import { join, relative } from 'path'

export interface MissingDependency {
  file: string
  pkg: string
  exportsRestrict: boolean
}

export type NecessaryDependencies = {
  resolved: Map<string, string>
  missing: MissingDependency[]
}

export async function hasNecessaryDependencies(
  baseDir: string,
  requiredPackages: MissingDependency[]
): Promise<NecessaryDependencies> {
  let resolutions = new Map<string, string>()
  const missingPackages = requiredPackages.filter((p) => {
    try {
      if (p.exportsRestrict) {
        const pkgPath = require.resolve(`${p.pkg}/package.json`, {
          paths: [baseDir],
        })
        const fileNameToVerify = relative(p.pkg, p.file)
        if (fileNameToVerify) {
          const fileToVerify = join(pkgPath, '..', fileNameToVerify)
          if (existsSync(fileToVerify)) {
            resolutions.set(p.pkg, join(pkgPath, '..'))
          } else {
            return true
          }
        } else {
          resolutions.set(p.pkg, pkgPath)
        }
      } else {
        resolutions.set(p.pkg, require.resolve(p.file, { paths: [baseDir] }))
      }
      return false
    } catch (_) {
      return true
    }
  })

  return {
    resolved: resolutions,
    missing: missingPackages,
  }
}
