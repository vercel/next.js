export interface MissingDependency {
  file: string
  pkg: string
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
      resolutions.set(p.pkg, require.resolve(p.file, { paths: [baseDir] }))
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
