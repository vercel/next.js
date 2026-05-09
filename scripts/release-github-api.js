// @ts-check

const execa = require('execa')
const fs = require('fs/promises')
const {
  createSignedCommit,
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
 * Replace Lerna's local release commit with an equivalent GitHub-signed commit,
 * then move the release tag and current branch to that new commit.
 */
async function createGitHubReleaseCommit(token) {
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], {
    captureOutput: true,
  })

  if (branch === 'HEAD') {
    throw new Error('Cannot create a GitHub release commit from detached HEAD')
  }

  const localReleaseSha = await git(['rev-parse', 'HEAD'], {
    captureOutput: true,
  })
  const baseSha = await getSingleParent(localReleaseSha)
  const tagName = await getLocalReleaseTagName(localReleaseSha)
  const message = await git(['log', '-1', '--pretty=%B'], {
    captureOutput: true,
  })

  console.log(
    `Creating GitHub-signed release commit for ${tagName} from local Lerna commit ${localReleaseSha}`
  )

  const commit = await createSignedCommit({
    token,
    owner: 'vercel',
    repo: 'next.js',
    baseSha,
    localCommitSha: localReleaseSha,
    message,
  })

  let createdTag = false

  try {
    await githubRequest(token, 'POST', `${REPO_API_PATH}/git/refs`, {
      ref: `refs/tags/${tagName}`,
      sha: commit.sha,
    })
    createdTag = true

    await githubRequest(
      token,
      'PATCH',
      `${REPO_API_PATH}/git/refs/heads/${branch}`,
      {
        sha: commit.sha,
        force: false,
      }
    )
  } catch (error) {
    if (createdTag) {
      await githubRequest(
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

  await alignLocalBranchWithSignedCommit(branch, commit.sha, { tagName })

  console.log(
    `Created GitHub-signed release commit ${commit.sha} and tag ${tagName}`
  )

  return {
    branch,
    sha: commit.sha,
    tagName,
  }
}

module.exports = {
  createGitHubReleaseCommit,
}
