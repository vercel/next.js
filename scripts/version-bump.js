#!/usr/bin/env node
// @ts-check

/*
 Bumps the version of every package in `packages/*` in lockstep and creates
 the release commit and tag.

 It stays small because of two properties of this repo: every package shares
 one version, and a release always bumps all of them, so there is no
 changed-detection to do. Internal dependencies use the
 `workspace:*` protocol, so dependents need no rewriting either -- pnpm
 substitutes the concrete version when packing.

 Usage:
   node scripts/version-bump.js <version|increment> [options]

   <version|increment>     an explicit version (`16.4.0-preview-abc-2026`) or a
                           semver increment (`prerelease`, `preminor`, `patch`,
                           ...)

   --preid <id>            prerelease identifier for pre* increments
   --no-git-tag-version    update the manifests but do not commit or tag
   --allow-branch <glob>   override the branches releases may run from;
                           repeatable, `**` allows any branch
*/

const fs = require('fs/promises')
const path = require('path')
const execa = require('execa')
const semver = require('semver')
const { readReleaseVersion } = require('./release-version')

const repoRoot = path.join(__dirname, '..')
const packagesDir = path.join(repoRoot, 'packages')
const releaseBranchesPath = path.join(__dirname, 'release-branches.json')

const SEMVER_INCREMENTS = new Set([
  'major',
  'minor',
  'patch',
  'premajor',
  'preminor',
  'prepatch',
  'prerelease',
])

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {string | undefined} */
  let versionArg
  /** @type {string | undefined} */
  let preid
  let gitTagVersion = true
  /** @type {string[]} */
  const allowBranch = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    switch (arg) {
      case '--preid':
        preid = argv[++i]
        break
      case '--allow-branch':
        allowBranch.push(argv[++i])
        break
      case '--no-git-tag-version':
        gitTagVersion = false
        break
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`)
        }
        if (versionArg !== undefined) {
          throw new Error(
            `Unexpected second version argument: ${arg} (already got ${versionArg})`
          )
        }
        versionArg = arg
    }
  }

  if (versionArg === undefined) {
    throw new Error('Missing <version|increment> argument')
  }

  return { versionArg, preid, gitTagVersion, allowBranch }
}

/**
 * Releases are restricted to `canary` and the release branches.
 * `scripts/create-release-branch.js` adds new release branches to the list.
 *
 * @param {string[]} allowBranchOverride
 */
async function assertBranchIsAllowed(allowBranchOverride) {
  const patterns =
    allowBranchOverride.length > 0
      ? allowBranchOverride
      : JSON.parse(await fs.readFile(releaseBranchesPath, 'utf8'))

  if (patterns.includes('**')) {
    return
  }

  const { stdout: currentBranch } = await execa('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ])

  if (!patterns.includes(currentBranch.trim())) {
    throw new Error(
      `Refusing to bump the version on branch "${currentBranch.trim()}". ` +
        `Allowed branches: ${patterns.join(', ')}. ` +
        `Pass \`--allow-branch **\` to override.`
    )
  }
}

/**
 * @param {string} currentVersion
 * @param {string} versionArg
 * @param {string | undefined} preid
 */
function computeNextVersion(currentVersion, versionArg, preid) {
  // An explicit version, as used by preview releases.
  if (semver.valid(versionArg)) {
    return versionArg
  }

  if (!SEMVER_INCREMENTS.has(versionArg)) {
    throw new Error(
      `"${versionArg}" is neither a valid version nor a semver increment ` +
        `(${[...SEMVER_INCREMENTS].join(', ')})`
    )
  }

  const nextVersion = semver.inc(
    currentVersion,
    /** @type {semver.ReleaseType} */ (versionArg),
    preid
  )

  if (nextVersion === null) {
    throw new Error(
      `Could not apply "${versionArg}" to current version ${currentVersion}`
    )
  }

  return nextVersion
}

/**
 * @param {string} nextVersion
 * @returns {Promise<string[]>} the names of the packages that were updated
 */
async function writeVersionToPackages(nextVersion) {
  const packageDirs = await fs.readdir(packagesDir)
  /** @type {string[]} */
  const updated = []

  for (const packageDir of packageDirs) {
    const manifestPath = path.join(packagesDir, packageDir, 'package.json')

    /** @type {string} */
    let raw
    try {
      raw = await fs.readFile(manifestPath, 'utf8')
    } catch (error) {
      // Not every directory under packages/ is necessarily a package.
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        continue
      }
      throw error
    }

    const manifest = JSON.parse(raw)
    manifest.version = nextVersion

    await fs.writeFile(
      manifestPath,
      JSON.stringify(manifest, null, 2) + (raw.endsWith('\n') ? '\n' : '')
    )
    updated.push(manifest.name)
  }

  if (updated.length === 0) {
    throw new Error(`Found no packages to version in ${packagesDir}`)
  }

  return updated
}

async function main() {
  const { versionArg, preid, gitTagVersion, allowBranch } = parseArgs(
    process.argv.slice(2)
  )

  await assertBranchIsAllowed(allowBranch)

  const currentVersion = readReleaseVersion()
  const nextVersion = computeNextVersion(currentVersion, versionArg, preid)

  console.log(`Bumping ${currentVersion} -> ${nextVersion}`)

  const updated = await writeVersionToPackages(nextVersion)
  console.log(`Updated ${updated.length} packages`)

  // `workspace:*` specifiers record no versions in the lockfile, so a version
  // bump never stales it and there is nothing to refresh here.
  // An unchanged lockfile is important since that means we can reuse
  // node_modules caches keyed on the hash of the lockfile.
  await execa('git', ['add', '.'], { cwd: repoRoot, stdio: 'inherit' })

  if (!gitTagVersion) {
    console.log('Skipping release commit and tag (--no-git-tag-version)')
    return
  }

  // `check-backport-canary-release.js` and `release-github-api.js` both
  // identify release commits by a subject that is exactly `v<version>`.
  const tagName = `v${nextVersion}`

  await execa('git', ['commit', '-m', tagName], {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  await execa('git', ['tag', tagName], { cwd: repoRoot, stdio: 'inherit' })

  console.log(`Created release commit and tag ${tagName}`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

module.exports = {
  parseArgs,
  computeNextVersion,
  assertBranchIsAllowed,
  writeVersionToPackages,
}
