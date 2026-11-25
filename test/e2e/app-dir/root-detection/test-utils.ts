/**
 * An npm lockfile, which makes Next.js treat the directory containing it as the
 * root of a project.
 */
export function packageLock(name: string): string {
  return JSON.stringify({
    name,
    version: '1.0.0',
    lockfileVersion: 3,
    packages: { '': { name, version: '1.0.0' } },
  })
}

export function packageJson(name: string, fields: object = {}): string {
  return JSON.stringify({ name, version: '1.0.0', ...fields })
}

export const multipleLockfilesWarning =
  /We detected multiple lockfiles and selected the directory of .+ as the root directory\./

export const gitRepositoryBoundaryWarning =
  /because it is outside the current Git repository/

export const homeDirectoryBoundaryWarning =
  /because it would include your home directory/
