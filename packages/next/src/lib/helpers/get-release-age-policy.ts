import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import spawn from 'next/dist/compiled/cross-spawn'
import picomatch from 'next/dist/compiled/picomatch'
import { coerce, lt, satisfies, validRange } from 'next/dist/compiled/semver'
import { findRootDirAndLockFiles } from '../find-root'
import { getPkgManager } from './get-pkg-manager'

export function getReleaseAgePolicy(directory: string) {
  // Keep legacy package-manager detection unchanged, while recognizing Bun apps.
  const userAgent = process.env.npm_config_user_agent
  const rootDir =
    userAgent?.startsWith('bun') || !userAgent
      ? findRootDirAndLockFiles(directory).rootDir
      : directory
  const manager =
    userAgent?.startsWith('bun') ||
    (!userAgent &&
      (existsSync(join(rootDir, 'bun.lock')) ||
        existsSync(join(rootDir, 'bun.lockb'))))
      ? 'bun'
      : getPkgManager(directory)

  // Read effective settings in the app directory and propagate manager failures.
  function run(args: string[], input: string | undefined) {
    const result = spawn.sync(manager, args, {
      cwd: directory,
      encoding: 'utf8',
      input,
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (result.error) {
      throw result.error
    }
    if (result.status !== 0) {
      throw new Error(
        `Could not read ${manager}'s release-age policy (exit ${result.status}).`
      )
    }
    return result.stdout.trim()
  }

  function readConfig(setting: string): unknown {
    const output = run(['config', 'get', setting, '--json'], undefined)
    return output === '' || output === 'undefined' ? null : JSON.parse(output)
  }

  // npm normalizes min-release-age into before; preserve that absolute cutoff.
  if (manager === 'npm') {
    const before = run(
      ['config', 'get', 'before', '--no-workspaces'],
      undefined
    )
    let publishedBefore: number | null = null
    if (before !== 'null' && before !== 'undefined') {
      const cutoff = Date.parse(before)
      if (!Number.isFinite(cutoff)) {
        throw new Error('Invalid npm minimum release age.')
      }
      if (cutoff < Date.now()) {
        publishedBefore = cutoff
      }
    }
    return { publishedBefore, isExcluded: () => false }
  }

  let age: unknown = null
  let exclusions: unknown = null
  let unit = 60_000
  let supportsPatterns = manager !== 'pnpm'
  let supportsVersions = manager === 'yarn'

  // Query supported managers in the app directory to include workspace and user config.
  if (manager === 'bun') {
    if (
      run(['install', '--help'], undefined).includes('--minimum-release-age')
    ) {
      // Bun parses TOML; project install settings override the global settings.
      const files = [
        join(process.env.XDG_CONFIG_HOME || homedir(), '.bunfig.toml'),
        join(rootDir, 'bunfig.toml'),
      ]
        .filter((file) => existsSync(file))
        .map((file) => readFileSync(file, 'utf8'))
      if (files.length > 0) {
        const config = JSON.parse(
          run(
            [
              '-e',
              `const files = JSON.parse(await Bun.stdin.text());
const configs = files.map(file => Bun.TOML.parse(file).install);
console.log(JSON.stringify(Object.assign({}, ...configs)));`,
            ],
            JSON.stringify(files)
          )
        )
        age = config.minimumReleaseAge ?? null
        exclusions = config.minimumReleaseAgeExcludes ?? null
      }
    }
    unit = 1_000
  } else {
    const version = coerce(run(['--version'], undefined))
    if (!version) {
      throw new Error(`Could not determine ${manager}'s version.`)
    }
    if (manager === 'pnpm') {
      supportsPatterns = !lt(version, '10.17.0')
      supportsVersions = !lt(version, '10.19.0')
    }
    const minimumVersion = { pnpm: '10.16.0', yarn: '4.10.0' }[manager]
    if (!lt(version, minimumVersion)) {
      age = readConfig(
        manager === 'pnpm' ? 'minimumReleaseAge' : 'npmMinimalAgeGate'
      )
      if (age !== null && age !== 0) {
        exclusions = readConfig(
          manager === 'pnpm'
            ? 'minimumReleaseAgeExclude'
            : 'npmPreapprovedPackages'
        )
      }
    }
  }

  // Invalid policy values must stop the upgrade instead of disabling the age gate.
  const minimumReleaseAge = age ?? 0
  if (
    typeof minimumReleaseAge !== 'number' ||
    !Number.isFinite(minimumReleaseAge * unit) ||
    minimumReleaseAge < 0
  ) {
    throw new Error(`Invalid ${manager} minimum release age.`)
  }
  if (
    exclusions !== null &&
    (!Array.isArray(exclusions) ||
      !exclusions.every((entry) => typeof entry === 'string'))
  ) {
    throw new Error(`Invalid ${manager} release-age exclusions.`)
  }
  const patterns: string[] = exclusions ?? []

  return {
    publishedBefore:
      minimumReleaseAge === 0 ? null : Date.now() - minimumReleaseAge * unit,
    isExcluded(version: string) {
      return patterns.some((pattern) => {
        if (!supportsVersions) {
          return (
            pattern === 'next' ||
            (manager !== 'bun' &&
              supportsPatterns &&
              picomatch.isMatch('next', pattern))
          )
        }

        // pnpm supports exact version lists; Yarn also supports npm semver descriptors.
        const separator = pattern.lastIndexOf('@')
        const name = separator > 0 ? pattern.slice(0, separator) : pattern
        if (!picomatch.isMatch('next', name)) {
          return false
        }
        if (separator <= 0) {
          return true
        }
        const range = pattern.slice(separator + 1)
        if (manager === 'pnpm') {
          return range.split('||').some((entry) => entry.trim() === version)
        }
        return validRange(range) !== null && satisfies(version, range)
      })
    },
  }
}
