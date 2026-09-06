// @ts-check
const fs = require('fs')
const path = require('path')
const execa = require('execa')
const {
  configureGitHubAuth,
  getGitHubToken,
  getGitHubTokenMissingMessage,
} = require('./release-github-auth')
const {
  githubRequest,
  createSignedCommit,
  upsertBranchRef,
} = require('./github-utils/signed-commit')

const REPO_OWNER = 'vercel'
const REPO_NAME = 'next.js'

/**
 * Fail fast, before any file mutation, if the branch already exists.
 *
 * This doubles as the API preflight: it exercises the same git-data path the
 * script later writes to (blobs/trees/commits/refs), so a token missing those
 * grants fails here rather than midway through creating objects. A plain
 * repository GET would succeed with any valid installation token and so could
 * never catch that.
 */
async function verifyBranchIsAvailable(token, branch) {
  let existing

  try {
    existing = await githubRequest(
      token,
      'GET',
      `/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${branch}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // A 404 is the expected, successful outcome: the branch is available.
    if (message.includes('failed (404)')) {
      console.log(`Verified GitHub API access; branch ${branch} is available`)
      return
    }

    throw error
  }

  throw new Error(
    `Branch ${branch} already exists (at ${existing.object?.sha}). ` +
      `Delete it or choose a different branch name before re-running.`
  )
}

async function main() {
  const args = process.argv
  const branchName = args[args.indexOf('--branch-name') + 1]
  const tagName = args[args.indexOf('--tag-name') + 1]

  if (!branchName) {
    throw new Error('branchName value is missing!')
  }

  if (!tagName || !tagName.startsWith('v')) {
    throw new Error('tagName value is invalid "' + tagName + '"')
  }

  const githubToken = getGitHubToken()

  if (!githubToken) {
    console.log(getGitHubTokenMissingMessage())
    return
  }

  await configureGitHubAuth(githubToken)
  await verifyBranchIsAvailable(githubToken, branchName)

  await execa('git', ['checkout', '-b', branchName], {
    stdio: 'inherit',
  })
  await execa('git', ['fetch', 'origin', tagName, '--tags'], {
    stdio: 'inherit',
  })
  await execa('git', ['reset', '--hard', tagName], {
    stdio: 'inherit',
  })
  const lernaPath = path.join(__dirname, '..', 'lerna.json')
  const existingLerna = JSON.parse(
    await fs.promises.readFile(lernaPath, 'utf8')
  )
  existingLerna.command.publish.allowBranch.push(branchName)

  await fs.promises.writeFile(lernaPath, JSON.stringify(existingLerna, null, 2))

  const buildAndDeployPath = path.join(
    __dirname,
    '..',
    '.github',
    'workflows',
    'build_and_deploy.yml'
  )
  const buildAndDeploy = await fs.promises.readFile(buildAndDeployPath, 'utf8')
  await fs.promises.writeFile(
    buildAndDeployPath,
    buildAndDeploy.replace(/refs\/heads\/canary/g, `refs/heads/${branchName}`)
  )

  const buildAndTestPath = path.join(
    __dirname,
    '..',
    '.github',
    'workflows',
    'build_and_test.yml'
  )
  let buildAndTest = await fs.promises.readFile(buildAndTestPath, 'utf8')
  buildAndTest = buildAndTest
    .replace(`['canary']`, `['${branchName}']`)
    .replace(/[\s]{1,}('test-new-tests-.+',)/g, '')

  await fs.promises.writeFile(buildAndTestPath, buildAndTest)

  const commitMessage = 'setup release branch'

  await execa('git', ['add', '.'], {
    stdio: 'inherit',
  })
  await execa('git', ['commit', '-m', commitMessage], {
    stdio: 'inherit',
  })

  // Branch protection requires signed commits, so create the commit on the
  // remote as a GitHub-signed commit via the REST API instead of running
  // `git push` (which would push the unsigned local commit).
  //
  // Release tags are annotated tag objects, so dereference to the underlying
  // commit -- the tag object's SHA is not valid as a commit parent.
  const { stdout: baseSha } = await execa('git', [
    'rev-parse',
    `${tagName}^{commit}`,
  ])
  const { stdout: localCommitSha } = await execa('git', ['rev-parse', 'HEAD'])

  const signedCommit = await createSignedCommit({
    token: githubToken,
    owner: REPO_OWNER,
    repo: REPO_NAME,
    baseSha: baseSha.trim(),
    localCommitSha: localCommitSha.trim(),
    message: commitMessage,
  })

  await upsertBranchRef({
    token: githubToken,
    owner: REPO_OWNER,
    repo: REPO_NAME,
    branch: branchName,
    sha: signedCommit.sha,
  })

  console.log(
    `Created branch ${branchName} at signed commit ${signedCommit.sha}`
  )
}

main()
