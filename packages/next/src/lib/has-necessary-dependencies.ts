import { existsSync, promises as fs } from 'fs'
import { resolveFrom } from './resolve-from'
import { dirname, join, relative } from 'path'

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
  const missingPackages: MissingDependency[] = []

  await Promise.all(
    requiredPackages.map(async (p) => {
      try {
        const pkgPath = await fs.realpath(
          resolveFrom(baseDir, `${p.pkg}/package.json`)
        )
        const pkgDir = dirname(pkgPath)

        if (p.exportsRestrict) {
          const fileNameToVerify = relative(p.pkg, p.file)
          if (fileNameToVerify) {
            const fileToVerify = join(pkgDir, fileNameToVerify)
            if (existsSync(fileToVerify)) {
              resolutions.set(p.pkg, fileToVerify)
            } else {
              return missingPackages.push(p)
            }
          } else {
            resolutions.set(p.pkg, pkgPath)
          }
        } else {
          resolutions.set(p.pkg, resolveFrom(baseDir, p.file))
        }
      } catch (_) {
        return missingPackages.push(p)
      }
    })
  )

  return {
    resolved: resolutions,
    missing: missingPackages,
  }
}
