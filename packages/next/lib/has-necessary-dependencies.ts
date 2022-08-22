import { join, relative } from 'path'
import { fileExists } from './file-exists'

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
        const paths = require.resolve.paths(baseDir) || [baseDir]

        if (p.exportsRestrict) {
          const pkgPath = require.resolve(`${p.pkg}/package.json`, {
            paths,
          })
          const fileNameToVerify = relative(p.pkg, p.file)
          if (fileNameToVerify) {
            const fileToVerify = join(pkgPath, '..', fileNameToVerify)
            if (await fileExists(fileToVerify)) {
              resolutions.set(p.pkg, join(pkgPath, '..'))
            } else {
              return missingPackages.push(p)
            }
          } else {
            resolutions.set(p.pkg, pkgPath)
          }
        } else {
          resolutions.set(p.pkg, require.resolve(p.file, { paths }))
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
