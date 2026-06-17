// @ts-check
const path = require('path')
const execa = require('execa')
const resolveFrom = require('resolve-from')
const {
  configureGitHubAuth,
  getGitHubToken,
  getGitHubTokenMissingMessage,
  verifyGitHubApiAccess,
} = require('./release-github-auth')
const { createGitHubReleaseCommit } = require('./release-github-api')

const SEMVER_TYPES = ['patch', 'minor', 'major']

async function main() {
  const args = process.argv
  const releaseType = args[args.indexOf('--release-type') + 1]
  const semverType = args[args.indexOf('--semver-type') + 1]
  const isCanary = releaseType === 'canary'
  const isReleaseCandidate = releaseType === 'release-candidate'
  const isBeta = releaseType === 'beta'
  const dryRun = args.includes('--dry-run')

  if (
    releaseType !== 'stable' &&
    releaseType !== 'canary' &&
    releaseType !== 'release-candidate' &&
    releaseType !== 'beta'
  ) {
    console.log(
      `Invalid release type ${releaseType}, must be stable, canary, release-candidate, or beta`
    )
    return
  }
  if (!isCanary && !SEMVER_TYPES.includes(semverType)) {
    console.log(
      `Invalid semver type ${semverType}, must be one of ${SEMVER_TYPES.join(
        ', '
      )}`
    )
    return
  }

  const githubToken = getGitHubToken()

  if (dryRun) {
    console.log(
      'Dry run: keeping commits locally, skipping git push and GitHub release creation'
    )
  } else {
    if (!githubToken) {
      console.log(getGitHubTokenMissingMessage())
      return
    }

    const configStorePath = resolveFrom(
      path.join(process.cwd(), 'node_modules/release'),
      'configstore'
    )
    const ConfigStore = require(configStorePath)

    const config = new ConfigStore('release')
    config.set('token', githubToken)

    await configureGitHubAuth(githubToken)
    await verifyGitHubApiAccess(
      githubToken,
      '/repos/vercel/next.js/releases?per_page=1',
      'release lookup'
    )
  }

  console.log(`Running pnpm release-${isCanary ? 'canary' : 'stable'}...`)
  const preleaseType =
    semverType === 'major'
      ? 'premajor'
      : semverType === 'minor'
        ? 'preminor'
        : 'prerelease'

  const lernaArgs = [
    'lerna',
    'version',
    isCanary || isReleaseCandidate || isBeta ? preleaseType : semverType,
  ]

  if (isCanary) {
    lernaArgs.push('--preid', 'canary')
  } else if (isReleaseCandidate) {
    lernaArgs.push('--preid', 'rc')
  } else if (isBeta) {
    lernaArgs.push('--preid', 'beta')
  }

  lernaArgs.push('--force-publish', '-y', '--no-push')

  if (dryRun) {
    // So the dry-run can be exercised outside
    // of the release branches lerna.json restricts in real publishes.
    lernaArgs.push('--allow-branch', '**')
  }

  const child = execa('pnpm', lernaArgs, {
    stdio: 'inherit',
  })

  await child

  if (dryRun) {
    console.log(
      'Dry run: skipping GitHub-signed release commit and GitHub release creation'
    )
  } else {
    await createGitHubReleaseCommit(githubToken)

    if (isCanary || isReleaseCandidate || isBeta) {
      const releaseChild = execa(
        'pnpm',
        ['release', '--pre', '--skip-questions', '--show-url'],
        {
          stdio: 'inherit',
        }
      )

      await releaseChild
    }
  }

  console.log('Release process is finished')
}

main()
