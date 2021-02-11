import path from 'path'
import { fileExists } from './file-exists'

type Filename = string
type PackageName = string
type ResolvedFilename = string
type ResolvedPackagesMap = Map<PackageName, ResolvedFilename>
type PackageDescriptor = {
  filename: Filename
  packageName: PackageName
}

export function checkDependencies(
  directory: string,
  dependencies: PackageDescriptor[]
) {
  const resolvedPackagesMap = new Map<PackageName, ResolvedFilename>()
  const resolveOptions = { paths: [directory] }
  const missingDependencies = dependencies.filter((dependency) => {
    try {
      resolvedPackagesMap.set(
        dependency.packageName,
        require.resolve(dependency.filename, resolveOptions)
      )
      return false
    } catch (_) {
      return true
    }
  })
  return {
    resolvedPackagesMap,
    missingDependencies,
  }
}

export async function getPackageInstallCommand(directory: string) {
  const yarnLockFile = path.join(directory, 'yarn.lock')
  const isYarn = await fileExists(yarnLockFile).catch(() => false)
  return isYarn ? 'yarn add --dev' : 'npm install --save-dev'
}
