import type { PackageManager } from './get-pkg-manager'

/**
 * Pins packages from this repository to their packed tarballs in apps that
 * tests generate.
 *
 * Isolated tests pass the tarball of every packed workspace package through
 * `NEXT_TEST_PKG_PATHS`. Direct dependencies already point at those tarballs,
 * but dependencies of `next` (for example `@next/env` and `@next/upgrade`)
 * would otherwise come from the registry, where the version under test may
 * not exist yet. Packages that are direct dependencies of the app are left
 * out, because npm rejects overrides that conflict with a direct dependency.
 *
 * Returns the overrides that belong in `pnpm-workspace.yaml` (pnpm v11 no
 * longer reads them from package.json). Every other package manager gets them
 * in `packageJson`.
 */
export function addTestPackageOverrides(
  packageJson: Record<string, any>,
  testPkgPaths: Map<string, string> | null,
  packageManager: PackageManager,
  pnpmMajorVersion: number | null
): Record<string, string> | null {
  if (!testPkgPaths) return null

  const directDependencies = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ])
  const overrides: Record<string, string> = {}
  for (const [name, tarballPath] of [...testPkgPaths].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    if (!directDependencies.has(name)) {
      overrides[name] = tarballPath
    }
  }
  if (Object.keys(overrides).length === 0) return null

  switch (packageManager) {
    case 'pnpm':
      // Matches where the generated pnpm-workspace.yaml is written.
      if (pnpmMajorVersion === null || pnpmMajorVersion >= 11) {
        return overrides
      }
      packageJson.pnpm = { ...packageJson.pnpm, overrides }
      return null
    case 'yarn':
      packageJson.resolutions = overrides
      return null
    case 'npm':
    case 'bun':
      packageJson.overrides = overrides
      return null
  }
}

/** Formats overrides as a `pnpm-workspace.yaml` section. */
export function formatPnpmWorkspaceOverrides(
  overrides: Record<string, string>,
  eol: string
): string {
  return [
    'overrides:',
    ...Object.entries(overrides).map(
      ([name, tarballPath]) =>
        `  ${JSON.stringify(name)}: ${JSON.stringify(tarballPath)}`
    ),
    '',
  ].join(eol)
}
