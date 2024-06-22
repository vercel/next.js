import { existsSync, promises as fs } from 'fs'
import { resolveFrom } from './resolve-from'
import { dirname, join, relative } from 'path'

export interface MissingDependency {
  file: string
  /**
   * The package's package.json (e.g. require(`${pkg}/package.json`)) MUST resolve.
   * If `exportsRestrict` is false, `${file}` MUST also resolve.
   */
  pkg: string
  /**
   * If true, the pkg's package.json needs to be resolvable.
   * If true, will resolve `file` relative to the real path of the package.json.
   *
   * For example, `{ file: '@types/react/index.d.ts', pkg: '@types/react', exportsRestrict: true }`
   * will try to resolve '@types/react/package.json' first and then assume `@types/react/index.d.ts`
   * resolves to `path.join(dirname(resolvedPackageJsonPath), 'index.d.ts')`.
   *
   * If false, will resolve `file` relative to the baseDir.
   * ForFor example, `{ file: '@types/react/index.d.ts', pkg: '@types/react', exportsRestrict: true }`
   * will try to resolve `@types/react/index.d.ts` directly.
   */
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
