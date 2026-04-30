// @ts-check

const execa = require('execa')
const fs = require('fs/promises')

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
 * Call the GitHub REST API with the release app token and include response
 * bodies in thrown errors so workflow failures show actionable details.
 */
async function githubRequest(token, method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const responseText = await response.text()

    throw new Error(
      `GitHub API ${method} ${path} failed (${response.status}): ${responseText}`
    )
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
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
 * List paths changed by the local release commit, using "\0" delimiters so
 * unusual file names do not affect parsing.
 */
async function getChangedFiles(baseSha, headSha) {
  const stdout = await git(
    ['diff-tree', '-r', '--name-only', '--no-renames', '-z', baseSha, headSha],
    { captureOutput: true, encoding: 'utf8' }
  )

  return String(stdout).split('\0').filter(Boolean)
}

/**
 * Read the Git tree metadata for a path so recreated tree entries preserve
 * file modes, blob types, and submodule commit pointers.
 */
async function getTreeEntry(commitSha, filePath) {
  const stdout = await git(['ls-tree', '-z', commitSha, '--', filePath], {
    captureOutput: true,
    encoding: 'utf8',
  })

  if (!stdout) {
    return null
  }

  // Reuse the existing Git object metadata for this path when building the
  // GitHub tree payload. git ls-tree -z emits "<mode> <type> <object>\t<path>\0".
  const match = /^(\d{6}) (\w+) ([0-9a-f]{40})\t/.exec(String(stdout))

  if (!match) {
    throw new Error(`Failed to parse git tree entry for ${filePath}`)
  }

  return {
    mode: match[1],
    type: match[2],
    sha: match[3],
  }
}

/**
 * Upload one file from the local release commit as a GitHub blob and return
 * the blob SHA for the recreated tree entry.
 */
async function createBlobForFile(token, commitSha, filePath) {
  const content = await git(['show', `${commitSha}:${filePath}`], {
    captureOutput: true,
    encoding: null,
    stripFinalNewline: false,
    maxBuffer: 1024 * 1024 * 100,
  })
  const blob = await githubRequest(
    token,
    'POST',
    `${REPO_API_PATH}/git/blobs`,
    {
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    }
  )

  return blob.sha
}

/**
 * Build a GitHub tree matching the local Lerna release commit, creating new
 * blob objects for changed files in parallel while preserving deletions and
 * submodules.
 */
async function createTreeFromLocalCommit({ token, baseSha, localReleaseSha }) {
  const baseTreeSha = await git(['rev-parse', `${baseSha}^{tree}`], {
    captureOutput: true,
  })
  const changedFiles = await getChangedFiles(baseSha, localReleaseSha)

  if (changedFiles.length === 0) {
    throw new Error(`Release commit ${localReleaseSha} has no file changes`)
  }

  const tree = await Promise.all(
    changedFiles.map(async (filePath) => {
      const treeEntry = await getTreeEntry(localReleaseSha, filePath)

      if (!treeEntry) {
        return {
          path: filePath,
          sha: null,
        }
      }

      if (treeEntry.type === 'commit') {
        return {
          path: filePath,
          mode: treeEntry.mode,
          type: treeEntry.type,
          sha: treeEntry.sha,
        }
      }

      const blobSha = await createBlobForFile(token, localReleaseSha, filePath)

      return {
        path: filePath,
        mode: treeEntry.mode,
        type: treeEntry.type,
        sha: blobSha,
      }
    })
  )

  const createdTree = await githubRequest(
    token,
    'POST',
    `${REPO_API_PATH}/git/trees`,
    {
      base_tree: baseTreeSha,
      tree,
    }
  )

  return createdTree.sha
}

/**
 * Refresh local refs after the API writes so later release steps see the
 * GitHub-signed commit and tag instead of Lerna's unsigned local commit.
 */
async function alignLocalBranchWithGitHubReleaseCommit(
  branch,
  tagName,
  commitSha
) {
  const tagExists = await execa(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/tags/${tagName}`],
    {
      stdio: 'ignore',
      reject: false,
    }
  )

  if (tagExists.exitCode === 0) {
    await git(['tag', '-d', tagName])
  } else {
    console.log(`Local tag ${tagName} does not exist; skipping delete`)
  }

  await git([
    'fetch',
    'origin',
    `refs/heads/${branch}:refs/remotes/origin/${branch}`,
    `refs/tags/${tagName}:refs/tags/${tagName}`,
  ])
  await git(['reset', '--hard', commitSha])
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

  const treeSha = await createTreeFromLocalCommit({
    token,
    baseSha,
    localReleaseSha,
  })
  const commit = await githubRequest(
    token,
    'POST',
    `${REPO_API_PATH}/git/commits`,
    {
      message,
      tree: treeSha,
      parents: [baseSha],
    }
  )

  if (!commit.verification?.verified) {
    throw new Error(
      `GitHub API created unsigned release commit ${commit.sha}: ${commit.verification?.reason}`
    )
  }

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

  await alignLocalBranchWithGitHubReleaseCommit(branch, tagName, commit.sha)

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
