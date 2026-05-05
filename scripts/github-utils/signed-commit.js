// @ts-check

const execa = require('execa')

/**
 * Call the GitHub REST API and include response bodies in thrown errors so
 * workflow failures show actionable details.
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

async function git(args, options = {}) {
  const { captureOutput = false, ...execaOptions } = options
  const { stdout } = await execa('git', args, {
    stdio: captureOutput ? 'pipe' : 'inherit',
    ...execaOptions,
  })

  return typeof stdout === 'string' ? stdout.trim() : stdout
}

/**
 * List paths changed between two commits, using "\0" delimiters so unusual
 * file names do not affect parsing.
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

  // git ls-tree -z emits "<mode> <type> <object>\t<path>\0".
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
 * Upload one file from a local commit as a GitHub blob and return the blob
 * SHA for the recreated tree entry.
 */
async function createBlobForFile(token, repoApiPath, commitSha, filePath) {
  const content = await git(['show', `${commitSha}:${filePath}`], {
    captureOutput: true,
    encoding: null,
    stripFinalNewline: false,
    maxBuffer: 1024 * 1024 * 100,
  })
  const blob = await githubRequest(token, 'POST', `${repoApiPath}/git/blobs`, {
    content: Buffer.from(content).toString('base64'),
    encoding: 'base64',
  })

  return blob.sha
}

/**
 * Build a GitHub tree matching a local commit, creating new blob objects for
 * changed files in parallel while preserving deletions and submodules.
 */
async function createTreeFromLocalCommit({
  token,
  repoApiPath,
  baseSha,
  localCommitSha,
}) {
  const baseTreeSha = await git(['rev-parse', `${baseSha}^{tree}`], {
    captureOutput: true,
  })
  const changedFiles = await getChangedFiles(baseSha, localCommitSha)

  if (changedFiles.length === 0) {
    throw new Error(`Commit ${localCommitSha} has no file changes`)
  }

  const tree = await Promise.all(
    changedFiles.map(async (filePath) => {
      const treeEntry = await getTreeEntry(localCommitSha, filePath)

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

      const blobSha = await createBlobForFile(
        token,
        repoApiPath,
        localCommitSha,
        filePath
      )

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
    `${repoApiPath}/git/trees`,
    {
      base_tree: baseTreeSha,
      tree,
    }
  )

  return createdTree.sha
}

/**
 * Build a GitHub tree from the local commit's diff against `baseSha`, then
 * create a GitHub-signed commit on top of `baseSha`. Returns the new commit
 * payload (including `sha`). Verifies `verification.verified`.
 */
async function createSignedCommit({
  token,
  owner,
  repo,
  baseSha,
  localCommitSha,
  message,
}) {
  const repoApiPath = `/repos/${owner}/${repo}`

  const treeSha = await createTreeFromLocalCommit({
    token,
    repoApiPath,
    baseSha,
    localCommitSha,
  })

  const commit = await githubRequest(
    token,
    'POST',
    `${repoApiPath}/git/commits`,
    {
      message,
      tree: treeSha,
      parents: [baseSha],
    }
  )

  if (!commit.verification?.verified) {
    throw new Error(
      `GitHub API created unsigned commit ${commit.sha}: ${commit.verification?.reason}`
    )
  }

  return commit
}

/**
 * Create the branch ref if it does not exist, otherwise fast-forward (or
 * `force`-update) it to the given commit SHA.
 */
async function upsertBranchRef({
  token,
  owner,
  repo,
  branch,
  sha,
  force = false,
}) {
  const repoApiPath = `/repos/${owner}/${repo}`

  try {
    await githubRequest(token, 'POST', `${repoApiPath}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha,
    })
    return { created: true }
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)

    if (!errMessage.includes('Reference already exists')) {
      throw error
    }

    await githubRequest(
      token,
      'PATCH',
      `${repoApiPath}/git/refs/heads/${branch}`,
      {
        sha,
        force,
      }
    )

    return { created: false }
  }
}

/**
 * Refresh local refs after API writes so subsequent steps see the
 * GitHub-signed commit instead of the unsigned local commit. Optionally also
 * fetches a freshly created tag.
 */
async function alignLocalBranchWithSignedCommit(
  branch,
  commitSha,
  options = {}
) {
  const { tagName } = options

  if (tagName) {
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
    }
  }

  const fetchRefs = [`refs/heads/${branch}:refs/remotes/origin/${branch}`]
  if (tagName) {
    fetchRefs.push(`refs/tags/${tagName}:refs/tags/${tagName}`)
  }

  await git(['fetch', 'origin', ...fetchRefs])
  await git(['reset', '--hard', commitSha])
}

module.exports = {
  githubRequest,
  getChangedFiles,
  getTreeEntry,
  createBlobForFile,
  createTreeFromLocalCommit,
  createSignedCommit,
  upsertBranchRef,
  alignLocalBranchWithSignedCommit,
}
