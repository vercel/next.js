// @ts-check

const execa = require('execa')
const fs = require('fs/promises')
const {
  configureGitHubAuth,
  getGitHubToken,
  getGitHubTokenMissingMessage,
  verifyGitHubApiAccess,
} = require('./release-github-auth')
const { createGitHubReleaseCommit } = require('./release-github-api')

async function git(args, options = {}) {
  const { captureOutput = false, ...execaOptions } = options
  const { stdout } = await execa('git', args, {
    stdio: captureOutput ? 'pipe' : 'inherit',
    ...execaOptions,
  })

  return typeof stdout === 'string' ? stdout.trim() : stdout
}

async function runInherited(command, args, options = {}) {
  return execa(command, args, {
    stdio: 'inherit',
    ...options,
  })
}

async function deleteRemoteRef(ref) {
  await execa('git', ['push', 'origin', `:${ref}`], {
    stdio: 'inherit',
    reject: false,
  })
}

async function deleteLocalTag(tagName) {
  await execa('git', ['tag', '-d', tagName], {
    stdio: 'inherit',
    reject: false,
  })
}

async function getCurrentLernaTagName() {
  const { version } = JSON.parse(await fs.readFile('lerna.json', 'utf8'))
  return `v${version}`
}

async function getGitHubCommit(token, sha) {
  const response = await fetch(
    `https://api.github.com/repos/vercel/next.js/git/commits/${sha}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )

  if (!response.ok) {
    throw new Error(
      `Failed to fetch created release API commit (${response.status}): ${await response.text()}`
    )
  }

  return response.json()
}

async function main() {
  const githubToken = getGitHubToken()

  if (!githubToken) {
    throw new Error(getGitHubTokenMissingMessage())
  }

  const runId = process.env.GITHUB_RUN_ID || String(Date.now())
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT
    ? `-${process.env.GITHUB_RUN_ATTEMPT}`
    : ''
  const suffix = `commit-${runId}${runAttempt}`
  const branchName = `github-app-release-dry-run/${suffix}`
  const tagName = `github-app-release-dry-run-${suffix}`
  const startingHead = await git(['rev-parse', 'HEAD'], { captureOutput: true })
  let localTagName
  let releaseResult

  await configureGitHubAuth(githubToken)
  await verifyGitHubApiAccess(
    githubToken,
    '/repos/vercel/next.js/releases?per_page=1',
    'release lookup'
  )

  try {
    console.log(`Creating disposable release API branch ${branchName}`)
    await git(['checkout', '-B', branchName, startingHead])
    await git(['push', 'origin', `HEAD:refs/heads/${branchName}`])

    console.log('Running Lerna locally without pushing release refs')
    await runInherited('pnpm', [
      'lerna',
      'version',
      'prerelease',
      '--preid',
      'canary',
      '--force-publish',
      '-y',
      '--no-push',
      '--allow-branch',
      'github-app-release-dry-run/**',
    ])

    localTagName = await getCurrentLernaTagName()
    releaseResult = await createGitHubReleaseCommit(githubToken, {
      branch: branchName,
      remoteTagName: tagName,
    })

    const createdCommit = await getGitHubCommit(githubToken, releaseResult.sha)

    if (!createdCommit.verification?.verified) {
      throw new Error(
        `Fetched release API commit ${releaseResult.sha} is not verified: ${createdCommit.verification?.reason}`
      )
    }

    console.log(
      `Release API smoke test created verified commit ${releaseResult.sha}`
    )
  } finally {
    console.log(`Cleaning up disposable release API refs`)
    await deleteRemoteRef(`refs/heads/${branchName}`)
    await deleteRemoteRef(`refs/tags/${tagName}`)
    await deleteLocalTag(tagName)

    if (releaseResult?.localTagName) {
      await deleteLocalTag(releaseResult.localTagName)
    } else if (localTagName) {
      await deleteLocalTag(localTagName)
    }

    await git(['reset', '--hard', startingHead])
    await git([
      'checkout',
      '-B',
      process.env.GITHUB_REF_NAME || 'canary',
      startingHead,
    ])
  }
}

main()
