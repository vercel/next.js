// @ts-check
const path = require('path')
const execa = require('execa')
const fs = require('fs/promises')
const semver = require('semver')
const resolveFrom = require('resolve-from')
const {
  configureGitHubAuth,
  getGitHubToken,
  getGitHubTokenMissingMessage,
  verifyGitHubApiAccess,
} = require('./release-github-auth')
const { createGitHubReleaseCommit } = require('./release-github-api')

const SEMVER_TYPES = ['patch', 'minor', 'major']

/**
 * A GitHub client (matching the `githubRequest` signature) for dry runs: it
 * logs the request (method, path, and body) and returns a minimal canned
 * response instead of hitting the API, so the sign/tag/push flow can be
 * exercised without creating remote refs. Long string values (e.g. the base64
 * blob content of file uploads) are truncated so the log stays readable.
 */
function createMockGitHubRequest() {
  let counter = 0

  const formatBody = (body) =>
    JSON.stringify(body, (_key, value) =>
      typeof value === 'string' && value.length > 200
        ? `${value.slice(0, 120)}… (${value.length} chars)`
        : value
    )

  return async function mockGitHubRequest(_token, method, apiPath, body) {
    console.log(
      `[dry-run] GitHub API ${method} ${apiPath}${
        body ? ` ${formatBody(body)}` : ''
      }`
    )

    // One canned shape covers every consumer: `.sha` (blobs/trees/commits) and
    // `.verification.verified` (commits). Ref writes ignore the return value.
    return {
      sha: (++counter).toString(16).padStart(40, '0'),
      verification: { verified: true },
    }
  }
}

/**
 * Compute the next `@preview` version when cutting ad-hoc from `canary`.
 *
 * Unlike the other prerelease channels, the preview line has no branch of its
 * own to hold its counter (we cut from canary and immediately revert the
 * version), so the next number is derived from the highest of the current
 * canary base and the published `next@preview` version:
 *
 *   base = max(canary major.minor.patch, npm @preview major.minor.patch)
 *   - base still on the published preview line -> continue it (n + 1)
 *   - canary advanced to a higher base (or no @preview published) -> reset to .0
 *
 * e.g. canary 16.3.0-canary.61 + @preview 16.3.0-preview.5 -> 16.3.0-preview.6;
 * if canary had advanced to 18.0.0-canary.x -> 18.0.0-preview.0.
 */
async function computePreviewVersion(canaryVersion) {
  const parsed = semver.parse(canaryVersion)
  if (!parsed) {
    throw new Error(`Invalid version in lerna.json: ${canaryVersion}`)
  }
  const canaryBase = `${parsed.major}.${parsed.minor}.${parsed.patch}`

  let previewTag
  try {
    const res = await fetch(
      'https://registry.npmjs.org/-/package/next/dist-tags'
    )
    const tags = await res.json()
    previewTag = tags.preview
  } catch (error) {
    console.log('Failed to fetch Next.js dist tags from the NPM registry.')
    throw error
  }

  // Default: start a fresh preview line at the current canary base.
  let version = `${canaryBase}-preview.0`

  if (previewTag) {
    const parsedPreview = semver.parse(previewTag)
    if (parsedPreview) {
      const previewBase = `${parsedPreview.major}.${parsedPreview.minor}.${parsedPreview.patch}`
      // Continue the published preview line only while the canary base hasn't
      // moved past it; otherwise keep the fresh `.0` at the higher base.
      if (semver.gte(previewBase, canaryBase)) {
        const incremented = semver.inc(previewTag, 'prerelease', 'preview')
        if (incremented) {
          version = incremented
        }
      }
    }
  }

  return version
}

async function main() {
  const args = process.argv
  const releaseType = args[args.indexOf('--release-type') + 1]
  const semverType = args[args.indexOf('--semver-type') + 1]
  const isCanary = releaseType === 'canary'
  const isReleaseCandidate = releaseType === 'release-candidate'
  const isBeta = releaseType === 'beta'
  const isPreview = releaseType === 'preview'
  const dryRun = args.includes('--dry-run')

  if (
    releaseType !== 'stable' &&
    releaseType !== 'canary' &&
    releaseType !== 'release-candidate' &&
    releaseType !== 'beta' &&
    releaseType !== 'preview'
  ) {
    console.log(
      `Invalid release type ${releaseType}, must be stable, canary, release-candidate, beta, or preview`
    )
    return
  }
  // canary and preview derive their version automatically, so they don't need
  // a semver type.
  if (!isCanary && !isPreview && !SEMVER_TYPES.includes(semverType)) {
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

  console.log(`Running pnpm release-${releaseType}...`)

  const { version: canaryVersion } = JSON.parse(
    await fs.readFile(path.join(process.cwd(), 'lerna.json'), 'utf-8')
  )

  // The current branch tip, captured before Lerna creates the release
  // commit(s). For a preview release this is the base that both the
  // preview-bump and the revert-to-canary commits are signed on top of.
  const { stdout: baseSha } = await execa('git', ['rev-parse', 'HEAD'])

  // Preview cuts ad-hoc from canary use an explicit, computed version rather
  // than a Lerna prerelease bump (see computePreviewVersion).
  const previewVersion = isPreview
    ? await computePreviewVersion(canaryVersion)
    : null

  const preleaseType =
    semverType === 'major'
      ? 'premajor'
      : semverType === 'minor'
        ? 'preminor'
        : 'prerelease'

  const versionArg =
    previewVersion ??
    (isCanary || isReleaseCandidate || isBeta ? preleaseType : semverType)

  const lernaArgs = ['lerna', 'version', versionArg]

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

  if (isPreview) {
    // Lerna's bump commit (now HEAD, tagged v<previewVersion>) carries the
    // preview versions. Add a second commit that restores the canary versions
    // so `canary` keeps advancing its own line; the preview tag still points at
    // the bump commit. Both land in a single push (see
    // createGitHubReleaseCommit). The message intentionally does not end in a
    // version so check-is-release.js doesn't treat the new canary HEAD as a
    // publish commit.
    await execa('git', ['revert', '--no-commit', 'HEAD'], { stdio: 'inherit' })
    await execa(
      'git',
      [
        'commit',
        '-m',
        `Restore canary version ${canaryVersion} after v${previewVersion} preview release`,
      ],
      { stdio: 'inherit' }
    )
  }

  const releaseCommitOptions = isPreview
    ? { baseSha, tagName: `v${previewVersion}` }
    : {}

  if (dryRun) {
    // Exercise the full sign/tag/push flow with a mock GitHub client that logs
    // instead of calling the API, so the replay and tagging logic is covered
    // without creating any remote commits, tags, or refs.
    console.log(
      'Dry run: creating GitHub-signed release commit(s) with a mock GitHub client (no API calls)'
    )
    await createGitHubReleaseCommit(githubToken, {
      ...releaseCommitOptions,
      githubRequest: createMockGitHubRequest(),
    })
    console.log('Dry run: skipping GitHub release creation')
  } else {
    await createGitHubReleaseCommit(githubToken, releaseCommitOptions)

    if (isCanary || isReleaseCandidate || isBeta || isPreview) {
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
