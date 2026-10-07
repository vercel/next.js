/* eslint-disable import/no-extraneous-dependencies */
import { t } from 'tar'
import type { PackageManager } from './get-pkg-manager'

/**
 * Pins packages from this repository to their packed tarballs in apps that
 * tests generate.
 *
 * Isolated tests pass the tarball of every packed workspace package through
 * `NEXT_TEST_PKG_PATHS`. Direct dependencies already point at those tarballs,
 * but dependencies of `next` (for example `@next/env` and `@next/upgrade`)
 * would otherwise come from the registry, where the version under test may
 * not exist yet.
 *
 * Only packed packages the app can actually install are overridden: those
 * reachable through the `dependencies` / `optionalDependencies` of the packed
 * packages it depends on directly. Yarn Classic resolves every `resolutions`
 * entry, even ones the app never uses, so listing unrelated packages pulls in
 * their whole dependency tree. Packages that are direct dependencies of the
 * app are left out too, because npm rejects overrides that conflict with a
 * direct dependency.
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
  const reachable = findReachablePackedPackages(
    [...directDependencies].filter((name) => testPkgPaths.has(name)),
    testPkgPaths
  )
  const overrides: Record<string, string> = {}
  for (const name of [...reachable].sort((a, b) => a.localeCompare(b))) {
    if (!directDependencies.has(name)) {
      overrides[name] = testPkgPaths.get(name)!
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

/**
 * Walks the dependencies of the given packed packages, following only names
 * that are packed too. Includes the starting packages.
 */
function findReachablePackedPackages(
  roots: string[],
  testPkgPaths: Map<string, string>
): Set<string> {
  const reachable = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.pop()!
    if (reachable.has(name)) continue
    reachable.add(name)

    const manifest = readPackedManifest(testPkgPaths.get(name)!)
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    })) {
      if (testPkgPaths.has(dependency) && !reachable.has(dependency)) {
        queue.push(dependency)
      }
    }
  }
  return reachable
}

function readPackedManifest(tarballPath: string): Record<string, any> {
  const chunks: Buffer[] = []
  try {
    t({
      file: tarballPath,
      sync: true,
      filter: (entryPath) => entryPath === 'package/package.json',
      onReadEntry: (entry) => {
        entry.on('data', (chunk: Buffer) => chunks.push(chunk))
      },
    })
    if (chunks.length === 0) {
      throw new Error('package/package.json not found')
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    throw new Error(
      `Could not read package.json from the packed test package ${tarballPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}
