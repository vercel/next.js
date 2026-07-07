// @ts-check
const { promisify } = require('util')
const { Octokit } = require('octokit')
const { exec: execOriginal } = require('child_process')
const {
  createSignedCommit,
  upsertBranchRef,
} = require('./github-utils/signed-commit')

const exec = promisify(execOriginal)

const {
  RELEASE_GITHUB_TOKEN = '',
  PR_GITHUB_TOKEN = '',
  RELEASE_GITHUB_APP_SLUG = '',
  RELEASE_GITHUB_APP_USER_ID = '',
  SCRIPT = '',
  BRANCH_NAME = 'unknown',
  PR_TITLE = 'Automated update',
  PR_BODY = '',
} = process.env

if (!RELEASE_GITHUB_TOKEN) {
  console.log('missing RELEASE_GITHUB_TOKEN env')
  process.exit(1)
}
if (!PR_GITHUB_TOKEN) {
  console.log('missing PR_GITHUB_TOKEN env')
  process.exit(1)
}
if (!RELEASE_GITHUB_APP_SLUG) {
  console.log('missing RELEASE_GITHUB_APP_SLUG env')
  process.exit(1)
}
if (!RELEASE_GITHUB_APP_USER_ID) {
  console.log('missing RELEASE_GITHUB_APP_USER_ID env')
  process.exit(1)
}
if (!SCRIPT) {
  console.log('missing SCRIPT env')
  process.exit(1)
}

const REPO_OWNER = 'vercel'
const REPO_NAME = 'next.js'

async function main() {
  const octokit = new Octokit({ auth: PR_GITHUB_TOKEN })
  const branchName = `update/${BRANCH_NAME}-${Date.now()}`
  const botUserName = `${RELEASE_GITHUB_APP_SLUG}[bot]`
  const botUserEmail = `${RELEASE_GITHUB_APP_USER_ID}+${RELEASE_GITHUB_APP_SLUG}[bot]@users.noreply.github.com`

  await exec(`node ${SCRIPT}`)

  await exec(`git config user.name "${botUserName}"`)
  await exec(`git config user.email "${botUserEmail}"`)
  await exec(`git checkout -b ${branchName}`)
  await exec(`git add -A`)
  await exec(`git commit --message ${branchName}`)

  const changesResult = await exec(`git diff HEAD~ --name-only`)
  const changedFiles = changesResult.stdout
    .split('\n')
    .filter((line) => line.trim())

  if (changedFiles.length === 0) {
    console.log('No files changed skipping.')
    return
  }

  // Branch protection requires signed commits, so push the local commit to
  // the remote as a GitHub-signed commit via the REST API instead of
  // running `git push` (which would push an unsigned commit). The branch
  // name is unique per run, so this always creates a fresh ref.
  const baseSha = (await exec(`git rev-parse HEAD~1`)).stdout.trim()
  const localCommitSha = (await exec(`git rev-parse HEAD`)).stdout.trim()

  const signedCommit = await createSignedCommit({
    token: RELEASE_GITHUB_TOKEN,
    owner: REPO_OWNER,
    repo: REPO_NAME,
    baseSha,
    localCommitSha,
    message: branchName,
  })

  await upsertBranchRef({
    token: RELEASE_GITHUB_TOKEN,
    owner: REPO_OWNER,
    repo: REPO_NAME,
    branch: branchName,
    sha: signedCommit.sha,
  })

  const { data: pullRequests } = await octokit.rest.pulls.list({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    state: 'open',
    sort: 'created',
    direction: 'desc',
    per_page: 100,
  })

  const pullRequest = await octokit.rest.pulls.create({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    head: branchName,
    base: 'canary',
    title: PR_TITLE,
    body: PR_BODY,
  })

  await octokit.rest.issues.addLabels({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    issue_number: pullRequest.data.number,
    labels: ['run-react-18-tests'],
  })

  console.log('Created pull request', pullRequest.url)

  const previousPullRequests = pullRequests.filter(({ title, user }) => {
    return title.includes(PR_TITLE) && user.login === botUserName
  })

  if (previousPullRequests.length) {
    for await (const previousPullRequest of previousPullRequests) {
      console.log(
        `Closing previous pull request: ${previousPullRequest.html_url}`
      )

      await octokit.rest.pulls.update({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        pull_number: previousPullRequest.number,
        state: 'closed',
      })
    }
  }
}

main().catch((err) => {
  console.error(err)
  // Ensure the process exists with a non-zero exit code so that the workflow fails
  process.exit(1)
})
