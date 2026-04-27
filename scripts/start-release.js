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

const SEMVER_TYPES = ['patch', 'minor', 'major']

async function main() {
  const args = process.argv
  const releaseType = args[args.indexOf('--release-type') + 1]
  const semverType = args[args.indexOf('--semver-type') + 1]
  const isCanary = releaseType === 'canary'
  const isReleaseCandidate = releaseType === 'release-candidate'
  const isBeta = releaseType === 'beta'

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

  console.log(`Running pnpm release-${isCanary ? 'canary' : 'stable'}...`)
  const preleaseType =
    semverType === 'major'
      ? 'premajor'
      : semverType === 'minor'
        ? 'preminor'
        : 'prerelease'

  let command = isCanary
    ? `pnpm lerna version ${preleaseType} --preid canary --force-publish -y`
    : isReleaseCandidate
      ? `pnpm lerna version ${preleaseType} --preid rc --force-publish -y`
      : isBeta
        ? `pnpm lerna version ${preleaseType} --preid beta --force-publish -y`
        : `pnpm lerna version ${semverType} --force-publish -y`

  if (isCanary || isReleaseCandidate || isBeta) {
    command += ' && pnpm release --pre --skip-questions --show-url'
  }

  const child = execa(command, {
    stdio: 'pipe',
    shell: true,
  })

  child.stdout?.pipe(process.stdout)
  child.stderr?.pipe(process.stderr)
  await child
  console.log('Release process is finished')
}

main()
