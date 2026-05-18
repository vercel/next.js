// @ts-check

const execa = require('execa')

const REPO_URL = 'github.com/vercel/next.js.git'

function getGitHubToken() {
  return process.env.RELEASE_GITHUB_TOKEN
}

function getGitHubTokenMissingMessage() {
  return 'Missing RELEASE_GITHUB_TOKEN'
}

function getGitUser() {
  const appSlug = process.env.RELEASE_GITHUB_APP_SLUG
  const appUserId = process.env.RELEASE_GITHUB_APP_USER_ID

  if (appSlug && appUserId) {
    return {
      name: `${appSlug}[bot]`,
      email: `${appUserId}+${appSlug}[bot]@users.noreply.github.com`,
    }
  }

  return {
    name: process.env.RELEASE_GITHUB_USER_NAME || 'nextjs-bot',
    email: process.env.RELEASE_GITHUB_USER_EMAIL || 'it+nextjs-bot@vercel.com',
  }
}

async function configureGitHubAuth(token) {
  const gitUser = getGitUser()
  const remoteUrl = `https://x-access-token:${encodeURIComponent(
    token
  )}@${REPO_URL}`

  await execa('git', ['remote', 'set-url', 'origin', remoteUrl], {
    stdio: 'inherit',
  })
  await execa('git', ['config', 'user.name', gitUser.name], {
    stdio: 'inherit',
  })
  await execa('git', ['config', 'user.email', gitUser.email], {
    stdio: 'inherit',
  })
}

async function verifyGitHubApiAccess(token, path, label) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Failed to verify GitHub API access for ${label} (${response.status}): ${await response.text()}`
    )
  }

  console.log(`Verified GitHub API access for ${label}`)
}

module.exports = {
  configureGitHubAuth,
  getGitHubToken,
  getGitHubTokenMissingMessage,
  verifyGitHubApiAccess,
}
