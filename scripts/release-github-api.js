// @ts-check

const execa = require('execa')
const fs = require('fs/promises')
const {
  replayLocalCommitsAsSigned,
  githubRequest,
  alignLocalBranchWithSignedCommit,
} = require('./github-utils/signed-commit')

const REPO_API_PATH = '/repos/vercel/next.js'

async function git(args, options = {}) {
  const { captureOutput = false, ...execaOptions } = options
  const { stdout } = await execa('git', args, {
    stdio: captureOutput ? 'pipe' : 'inherit',
    ...execaOptions,
  })

  return typeof stdout === 'string' ? stdout.trim() : stdout
}

/**
 * Verify the local Lerna release commit has the version tag implied by
 * lerna.json, then return that tag name for GitHub ref creation.
 */
async function getLocalReleaseTagName(commitSha) {
  const { version } = JSON.parse(await fs.readFile('lerna.json', 'utf8'))
  const expectedTagName = `v${version}`
  const tags = String(
    await git(['tag', '--points-at', commitSha], { captureOutput: true })
  )
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)

  if (!tags.includes(expectedTagName)) {
    throw new Error(
      `Expected local Lerna release commit ${commitSha} to be tagged with ${expectedTagName}; found ${tags.join(
        ', '
      )}`
    )
  }

  return expectedTagName
}

/**
 * Return the local Lerna release commit's single parent so the GitHub-created
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
 * Replace Lerna's local release commit(s) with equivalent GitHub-signed
 * commits, then move the release tag and current branch in a single branch
 * push.
 *
 * Signs every local commit between the remote base and local HEAD. The release
 * tag is placed on the signed commit that corresponds to the local Lerna
 * release commit; the branch is fast-forwarded to the final signed commit.
 *
 * For a normal release this is a single commit (tag == branch head). For an
 * ad-hoc preview release the local history is two commits — the preview
 * version bump (tagged) followed by a revert restoring the canary version — so
 * the tag points at the preview commit while the branch ends on the revert.
 * `options.baseSha` and `options.tagName` let the caller pin both explicitly
 * (required for preview, since after the revert `lerna.json` no longer matches
 * HEAD).
 *
 * `options.githubRequest` injects a custom GitHub client (signature matching
 * `githubRequest`). A dry run passes a logging mock so the whole sign/tag/push
 * flow is exercised without touching the API; when a mock is used the final
 * local-branch sync is skipped (the signed commits don't exist on the remote).
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

module.exports = {
  createGitHubReleaseCommit,
}
