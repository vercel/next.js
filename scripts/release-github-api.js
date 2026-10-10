// @ts-check

const execa = require('execa')
const semver = require('semver')
const {
  replayLocalCommitsAsSigned,
  githubRequest,
  alignLocalBranchWithSignedCommit,
} = require('./github-utils/signed-commit')
const { generateChangelog } = require('./release-changelog')
const { readReleaseVersion } = require('./release-version')

const REPO_API_PATH = '/repos/vercel/next.js'

const LTS_ACTIVE_BRANCH = 'releases/lts/active'
const LTS_MAINTENANCE_BRANCH = 'releases/lts/maintenance'

async function git(args, options = {}) {
  const { captureOutput = false, ...execaOptions } = options
  const { stdout } = await execa('git', args, {
    stdio: captureOutput ? 'pipe' : 'inherit',
    ...execaOptions,
  })

  return typeof stdout === 'string' ? stdout.trim() : stdout
}

/**
 * Verify the local release commit has the version tag implied by the version
 * source of truth, then return that tag name for GitHub ref creation.
 */
async function getLocalReleaseTagName(commitSha) {
  const expectedTagName = `v${readReleaseVersion()}`
  const tags = String(
    await git(['tag', '--points-at', commitSha], { captureOutput: true })
  )
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)

  if (!tags.includes(expectedTagName)) {
    throw new Error(
      `Expected local release commit ${commitSha} to be tagged with ${expectedTagName}; found ${tags.join(
        ', '
      )}`
    )
  }

  return expectedTagName
}

/**
 * Return the local release commit's single parent so the GitHub-created
 * commit can replay the same tree change on top of the same base commit.
 */
async function getSingleParent(commitSha) {
  const revList = String(
    await git(['rev-list', '--parents', '-n', '1', commitSha], {
      captureOutput: true,
    })
  )
  // git rev-list --parents emits "<commit> <parent...>".
  const [, ...parents] = revList.split(' ')

  if (parents.length !== 1) {
    throw new Error(
      `Expected release commit ${commitSha} to have exactly one parent; found ${parents.length}`
    )
  }

  return parents[0]
}

/**
 * Replace the local release commit(s) with equivalent GitHub-signed
 * commits, then move the release tag and current branch in a single branch
 * push.
 *
 * Signs every local commit between the remote base and local HEAD. The release
 * tag is placed on the signed commit that corresponds to the local
 * release commit; the branch is fast-forwarded to the final signed commit.
 *
 * For a normal release this is a single commit (tag == branch head). For an
 * ad-hoc preview release the local history is two commits — the preview
 * version bump (tagged) followed by a revert restoring the canary version — so
 * the tag points at the preview commit while the branch ends on the revert.
 * `options.baseSha` and `options.tagName` let the caller pin both explicitly
 * (required for preview, since after the revert the version source of truth no
 * longer matches HEAD).
 *
 * `options.githubRequest`
 * @param {string} token GitHub API token with repo access
 * @param {object} options
 * @param {string} [options.baseSha] The remote base commit to replay on top of
 * @param {string} [options.tagName] The release tag name to create
 * @param {import('./github-utils/signed-commit').githubRequest} [options.githubRequest]
 *   A custom GitHub client e.g. for using a logging mock when doing a dry run.
 */
async function createGitHubReleaseCommit(token, options = {}) {
  const request = options.githubRequest ?? githubRequest
  const usingMockClient = options.githubRequest != null

  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], {
    captureOutput: true,
  })

  if (branch === 'HEAD') {
    throw new Error('Cannot create a GitHub release commit from detached HEAD')
  }

  const localHead = await git(['rev-parse', 'HEAD'], {
    captureOutput: true,
  })
  const baseSha = options.baseSha ?? (await getSingleParent(localHead))
  const tagName = options.tagName ?? (await getLocalReleaseTagName(localHead))
  const localTaggedSha = await git(['rev-list', '-n', '1', tagName], {
    captureOutput: true,
  })

  console.log(
    `Creating GitHub-signed release commit(s) for ${tagName} from local commits ${baseSha}..${localHead}`
  )

  const { headSha, signedCommits } = await replayLocalCommitsAsSigned({
    token,
    owner: 'vercel',
    repo: 'next.js',
    fromBaseSha: baseSha,
    toLocalSha: localHead,
    request,
  })

  const taggedCommit = signedCommits.find(
    (entry) => entry.localSha === localTaggedSha
  )
  if (!taggedCommit) {
    throw new Error(
      `Could not find a signed commit for the release tag ${tagName} (local ${localTaggedSha})`
    )
  }
  const signedTagSha = taggedCommit.signedSha

  let createdTag = false

  try {
    await request(token, 'POST', `${REPO_API_PATH}/git/refs`, {
      ref: `refs/tags/${tagName}`,
      sha: signedTagSha,
    })
    createdTag = true

    await request(token, 'PATCH', `${REPO_API_PATH}/git/refs/heads/${branch}`, {
      sha: headSha,
      force: false,
    })
  } catch (error) {
    if (createdTag) {
      await request(
        token,
        'DELETE',
        `${REPO_API_PATH}/git/refs/tags/${tagName}`
      ).catch((deleteError) => {
        console.error(`Failed to delete ${tagName} after release failure`)
        console.error(deleteError)
      })
    }

    throw error
  }

  if (usingMockClient) {
    // The signed commits only exist in the mock; there is nothing on the remote
    // to sync the local branch against.
    console.log(
      `Dry run: skipping local branch sync; would set ${branch} to ${headSha} and tag ${tagName} at ${signedTagSha}`
    )
  } else {
    await alignLocalBranchWithSignedCommit(branch, headSha, { tagName })
  }

  console.log(
    `Created GitHub-signed release tag ${tagName} at ${signedTagSha}; branch ${branch} now at ${headSha}`
  )

  return {
    branch,
    sha: signedTagSha,
    tagName,
    headSha,
    baseSha,
  }
}

/**
 * Current commit SHA of a branch ref. Fails loudly (the API error propagates)
 * when the branch does not exist — the LTS branches are bootstrapped manually,
 * so a missing ref is an operator error, not something to paper over.
 */
async function getBranchSha(request, token, branch) {
  const ref = await request(
    token,
    'GET',
    `${REPO_API_PATH}/git/ref/heads/${branch}`
  )
  return ref.object.sha
}

/**
 * The latest published stable major, read from npm (equivalent to
 * `npm view next version`; the same dist-tags endpoint computePreviewVersion
 * in start-release.js uses). Older majors publish under the `backport`
 * dist-tag, so `latest` always tracks the newest release line.
 */
async function getLatestPublishedMajor() {
  const res = await fetch('https://registry.npmjs.org/-/package/next/dist-tags')
  const tags = await res.json()

  if (!tags.latest) {
    throw new Error('Failed to read the latest dist-tag of next from npm')
  }

  return semver.major(tags.latest)
}

/**
 * Move the long-lived LTS branch refs after a stable release:
 * - patch: nothing (the release commit already advanced the branch it was cut
 *   on)
 * - minor: routed by the released version's major against the latest
 *   published major (npm `latest`): equal moves `releases/lts/active` to the
 *   new tag, latest - 1 moves `releases/lts/maintenance` to the new tag,
 *   anything else moves nothing
 * - major: `releases/lts/maintenance` is moved to active's previous position,
 *   then `releases/lts/active` is moved to the new tag
 *
 * All PATCHes use `force: true` because the histories diverge (e.g. the tag
 * commit for a major cut on canary is not a descendant of active's tip). When
 * the release was cut on the LTS branch itself, `createGitHubReleaseCommit`
 * already moved that branch to the same commit, so the move is a no-op.
 *
 * On partial failure (maintenance moved, active move failed) no rollback is
 * attempted: every target commit already exists on the remote, nothing
 * dangles, and the thrown error states the intended end state for manual
 * repair.
 *
 * @param {string} token GitHub API token with repo access
 * @param {object} options
 * @param {'patch' | 'minor' | 'major'} options.semverType
 * @param {string} options.tagName The just-created release tag (e.g. v16.3.0)
 * @param {string} options.tagSha The signed commit the tag points at
 * @param {import('./github-utils/signed-commit').githubRequest} [options.githubRequest]
 *   A custom GitHub client e.g. for using a logging mock when doing a dry run.
 */
async function updateLtsBranchRefs(
  token,
  { semverType, tagName, tagSha, githubRequest: request = githubRequest }
) {
  if (semverType === 'patch') {
    console.log('Stable patch release: LTS branch refs unchanged')
    return
  }

  if (semverType === 'major') {
    const activeSha = await getBranchSha(request, token, LTS_ACTIVE_BRANCH)

    await request(
      token,
      'PATCH',
      `${REPO_API_PATH}/git/refs/heads/${LTS_MAINTENANCE_BRANCH}`,
      { sha: activeSha, force: true }
    )
    console.log(
      `Moved ${LTS_MAINTENANCE_BRANCH} to ${activeSha} (previous ${LTS_ACTIVE_BRANCH} tip)`
    )

    await request(
      token,
      'PATCH',
      `${REPO_API_PATH}/git/refs/heads/${LTS_ACTIVE_BRANCH}`,
      { sha: tagSha, force: true }
    )
    console.log(`Moved ${LTS_ACTIVE_BRANCH} to ${tagName} (${tagSha})`)
    return
  }

  // The local HEAD is the just-created release commit, so the version source
  // of truth carries the released version (same assumption
  // `getLocalReleaseTagName` makes).
  const newMajor = semver.major(readReleaseVersion())
  const latestMajor = await getLatestPublishedMajor()

  if (newMajor === latestMajor) {
    await request(
      token,
      'PATCH',
      `${REPO_API_PATH}/git/refs/heads/${LTS_ACTIVE_BRANCH}`,
      { sha: tagSha, force: true }
    )
    console.log(`Moved ${LTS_ACTIVE_BRANCH} to ${tagName} (${tagSha})`)
  } else if (newMajor === latestMajor - 1) {
    await request(
      token,
      'PATCH',
      `${REPO_API_PATH}/git/refs/heads/${LTS_MAINTENANCE_BRANCH}`,
      { sha: tagSha, force: true }
    )
    console.log(`Moved ${LTS_MAINTENANCE_BRANCH} to ${tagName} (${tagSha})`)
  } else {
    console.log(
      `${tagName} (major ${newMajor}) is on neither the active (major ${latestMajor}) ` +
        `nor the maintenance (major ${latestMajor - 1}) line: LTS branch refs unchanged`
    )
  }
}

/**
 * Find the previous release tag for a changelog range: the highest-semver tag
 * reachable from `tagCommitSha` whose version is below `newVersion`. Returns
 * `null` when there is no earlier tag (e.g. the very first release).
 */
async function getPreviousReleaseTag(tagCommitSha, newVersion) {
  const output = String(
    await git(['tag', '--merged', tagCommitSha, 'v*'], { captureOutput: true })
  )

  const previous = output
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => ({ tag, version: semver.valid(tag.replace(/^v/, '')) }))
    .filter(
      (entry) => entry.version != null && semver.lt(entry.version, newVersion)
    )
    .sort((a, b) => semver.rcompare(a.version, b.version))[0]

  return previous ? previous.tag : null
}

/**
 * List the commits that make up a release, newest range endpoint inclusive,
 * excluding merge commits and the version-bump commits the release creates (whose
 * title is itself a version like `v16.3.0-canary.62`).
 */
async function getReleaseCommits(fromTag, tagCommitSha) {
  const range = fromTag ? `${fromTag}..${tagCommitSha}` : tagCommitSha
  const output = String(
    await git(['log', '--no-merges', '--format=%H%x1f%s', range], {
      captureOutput: true,
    })
  )

  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, title] = line.split('\x1f')
      return { hash, title }
    })
    .filter((commit) => semver.valid(commit.title.replace(/^v/, '')) == null)
}

/**
 * Create the GitHub release for an exact, already-created tag, replacing the
 * third-party `release` CLI (which always published the highest-semver tag
 * reachable from HEAD -- once an ad-hoc `@preview` tag lands on canary it would
 * hijack every canary release). The release is created as a prerelease draft;
 * `publish-release.js` un-drafts it once the npm publish succeeds.
 *
 * @param {string} token GitHub API token with repo access
 * @param {object} options
 * @param {string} options.tagName The release tag name to create
 * @param {import('./github-utils/signed-commit').githubRequest} [options.githubRequest]
 *   A custom GitHub client e.g. for using a logging mock when doing a dry run.
 */
async function createGitHubRelease(
  token,
  { tagName, githubRequest: request = githubRequest }
) {
  const newVersion = tagName.replace(/^v/, '')
  const tagCommitSha = await git(['rev-list', '-n', '1', tagName], {
    captureOutput: true,
  })
  const previousTag = await getPreviousReleaseTag(tagCommitSha, newVersion)
  const commits = await getReleaseCommits(previousTag, tagCommitSha)

  const getPullRequest = (number) =>
    request(token, 'GET', `${REPO_API_PATH}/pulls/${number}`).catch((error) => {
      console.warn(`Failed to fetch PR #${number} for changelog: ${error}`)
      return null
    })

  const changelog = await generateChangelog({ commits, getPullRequest })

  console.log(
    `Creating GitHub release ${tagName} (changelog range ${
      previousTag ?? '(initial)'
    }..${tagName}, ${commits.length} commits)`
  )

  await request(token, 'POST', `${REPO_API_PATH}/releases`, {
    tag_name: tagName,
    name: tagName,
    body: changelog || 'Initial release',
    prerelease: true,
    draft: true,
  })

  console.log(`Created draft prerelease ${tagName}`)
}

module.exports = {
  createGitHubReleaseCommit,
  createGitHubRelease,
  updateLtsBranchRefs,
}
