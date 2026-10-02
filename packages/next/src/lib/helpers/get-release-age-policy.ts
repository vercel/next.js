import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import spawn from 'next/dist/compiled/cross-spawn'
import picomatch from 'next/dist/compiled/picomatch'
import { coerce, lt, satisfies, validRange } from 'next/dist/compiled/semver'
import { findRootDirAndLockFiles } from '../find-root'
import { getPkgManager } from './get-pkg-manager'

function run(
  command: string,
  args: string[],
  directory: string,
  input: string | undefined
) {
  const result = spawn.sync(command, args, {
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
      `Could not read ${command}'s release-age policy (exit ${result.status}).`
    )
  }
  return result.stdout.trim()
}

function readConfig(
  manager: 'pnpm' | 'yarn',
  setting: string,
  directory: string
): unknown {
  const args = ['config', 'get', setting, '--json']
  const output = run(manager, args, directory, undefined)
  return output === '' || output === 'undefined' ? null : JSON.parse(output)
}

function readBunConfig(directory: string) {
  // Use Bun's parser so quoted keys and multiline arrays follow its TOML rules.
  const globalDirectory = process.env.XDG_CONFIG_HOME || homedir()
  const files = [
    join(globalDirectory, '.bunfig.toml'),
    join(directory, 'bunfig.toml'),
  ]
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, 'utf8'))
  if (files.length === 0) {
    return { age: null, excludes: null }
  }
  return JSON.parse(
    run(
      'bun',
      [
        '-e',
        `const files = JSON.parse(await Bun.stdin.text());
let age = null;
let excludes = null;
for (const file of files) {
  const config = Bun.TOML.parse(file).install;
  if (config && Object.hasOwn(config, 'minimumReleaseAge')) {
    age = config.minimumReleaseAge;
  }
  if (config && Object.hasOwn(config, 'minimumReleaseAgeExcludes')) {
    excludes = config.minimumReleaseAgeExcludes;
  }
}
console.log(JSON.stringify({ age, excludes }));`,
      ],
      directory,
      JSON.stringify(files)
    )
  ) as { age: unknown; excludes: unknown }
}

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
  let age: unknown = null
  let exclusions: unknown = null
  let publishedBefore: number | null = null
  let unit = 1_000
  let supportsPatterns = manager !== 'pnpm'
  let supportsVersions = manager === 'yarn'

  // Query supported managers in the app directory to include workspace and user config.
  if (manager === 'bun') {
    if (
      run('bun', ['install', '--help'], directory, undefined).includes(
        '--minimum-release-age'
      )
    ) {
      const config = readBunConfig(rootDir)
      age = config.age
      exclusions = config.excludes
    }
  } else if (manager === 'npm') {
    // npm normalizes min-release-age into before; older npm also supports before.
    const before = run(
      'npm',
      ['config', 'get', 'before', '--no-workspaces'],
      directory,
      undefined
    )
    if (before !== 'null' && before !== 'undefined') {
      publishedBefore = Date.parse(before)
      age = Math.max(0, Date.now() - publishedBefore)
    }
    unit = 1
  } else {
    const version = coerce(run(manager, ['--version'], directory, undefined))
    if (!version) {
      throw new Error(`Could not determine ${manager}'s version.`)
    }
    if (manager === 'pnpm') {
      supportsPatterns = !lt(version, '10.17.0')
      supportsVersions = !lt(version, '10.19.0')
    }
    const minimumVersion = { pnpm: '10.16.0', yarn: '4.10.0' }[manager]
    if (!lt(version, minimumVersion)) {
      const ageSetting = {
        pnpm: 'minimumReleaseAge',
        yarn: 'npmMinimalAgeGate',
      }[manager]
      const excludeSetting = {
        pnpm: 'minimumReleaseAgeExclude',
        yarn: 'npmPreapprovedPackages',
      }[manager]
      age = readConfig(manager, ageSetting, directory)
      unit = 60_000
      if (age !== null && age !== 0) {
        exclusions = readConfig(manager, excludeSetting, directory)
      }
    }
  }

  // Invalid policy values must stop the upgrade instead of disabling the age gate.
  if (
    age !== null &&
    (typeof age !== 'number' || !Number.isFinite(age) || age < 0)
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
  const minimumReleaseAge = (age ?? 0) as number
  if (!Number.isFinite(minimumReleaseAge * unit)) {
    throw new Error(`Invalid ${manager} minimum release age.`)
  }

  return {
    minimumReleaseAge: minimumReleaseAge * unit,
    publishedBefore,
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
