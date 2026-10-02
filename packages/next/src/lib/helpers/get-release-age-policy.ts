import { execSync } from 'child_process'
import picomatch from 'next/dist/compiled/picomatch'
import { coerce, lt, satisfies } from 'next/dist/compiled/semver'
import { getPkgManager } from './get-pkg-manager'

export function getReleaseAgePolicy(directory: string) {
  // TODO: Support Bun release-age policies.
  const manager = getPkgManager(directory)

  // Read effective settings in the app directory and propagate manager failures.
  function run(args: string) {
    return execSync(`${manager} ${args}`, {
      cwd: directory,
      encoding: 'utf8',
      timeout: 10_000,
    }).trim()
  }

  function readConfig(setting: string): unknown {
    const output = run(`config get ${setting} --json`)
    return output === '' || output === 'undefined' ? null : JSON.parse(output)
  }

  // npm normalizes min-release-age into before; preserve that absolute cutoff.
  if (manager === 'npm') {
    const before = run('config get before --no-workspaces')
    if (before === 'null' || before === 'undefined') {
      return null
    }
    const publishedBefore = Date.parse(before)
    if (!Number.isFinite(publishedBefore)) {
      throw new Error('Invalid npm minimum release age.')
    }
    if (publishedBefore >= Date.now()) {
      return null
    }
    return { publishedBefore, isExcluded: () => false }
  }

  // Older pnpm and Yarn versions do not enforce these settings.
  const managerVersion = coerce(run('--version'))
  if (!managerVersion) {
    throw new Error(`Could not determine ${manager}'s version.`)
  }
  const minimumVersion = manager === 'pnpm' ? '10.16.0' : '4.10.0'
  if (lt(managerVersion, minimumVersion)) {
    return null
  }

  // Invalid policy values must stop the upgrade instead of disabling the age gate.
  const age =
    readConfig(
      manager === 'pnpm' ? 'minimumReleaseAge' : 'npmMinimalAgeGate'
    ) ?? 0
  if (typeof age !== 'number' || !Number.isFinite(age * 60_000) || age < 0) {
    throw new Error(`Invalid ${manager} minimum release age.`)
  }
  if (age === 0) {
    return null
  }

  // Both managers use minutes, but their supported exemption syntax differs.
  const exclusions =
    readConfig(
      manager === 'pnpm' ? 'minimumReleaseAgeExclude' : 'npmPreapprovedPackages'
    ) ?? []
  if (
    !Array.isArray(exclusions) ||
    !exclusions.every((entry) => typeof entry === 'string')
  ) {
    throw new Error(`Invalid ${manager} release-age exclusions.`)
  }
  const supportsPatterns = manager === 'yarn' || !lt(managerVersion, '10.17.0')
  const supportsVersions = manager === 'yarn' || !lt(managerVersion, '10.19.0')

  return {
    publishedBefore: Date.now() - age * 60_000,
    isExcluded(version: string) {
      return exclusions.some((pattern) => {
        // pnpm supports exact version lists; Yarn also supports npm semver descriptors.
        const separator = supportsVersions ? pattern.lastIndexOf('@') : -1
        const name = separator > 0 ? pattern.slice(0, separator) : pattern
        const matchesName = supportsPatterns
          ? picomatch.isMatch('next', name)
          : name === 'next'
        if (!matchesName) {
          return false
        }
        if (separator <= 0) {
          return true
        }
        const range = pattern.slice(separator + 1)
        if (manager === 'pnpm') {
          return range.split('||').some((entry) => entry.trim() === version)
        }
        return satisfies(version, range)
      })
    },
  }
}
