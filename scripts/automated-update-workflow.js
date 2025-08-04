const { promisify } = require('util')
const { Octokit } = require('octokit')
const { exec: execOriginal } = require('child_process')

const exec = promisify(execOriginal)

const {
  GITHUB_TOKEN = '',
  SCRIPT = '',
  BRANCH_NAME = 'unknown',
  PR_TITLE = 'Automated update',
  PR_BODY = '',
} = process.env

if (!GITHUB_TOKEN) {
  console.log('missing GITHUB_TOKEN env')
  process.exit(1)
}
if (!SCRIPT) {
  console.log('missing SCRIPT env')
  process.exit(1)
}

async function main() {
  const octokit = new Octokit({ auth: GITHUB_TOKEN })
  const branchName = `update/${BRANCH_NAME}-${Date.now()}`

  await exec(`node ${SCRIPT}`)

  await exec(`git config user.name "nextjs-bot"`)
  await exec(`git config user.email "it+nextjs-bot@vercel.com"`)
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

  await exec(`git push origin ${branchName}`)

  const repo = 'next.js'
  const owner = 'vercel'

  const { data: pullRequests } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    sort: 'created',
    direction: 'desc',
    per_page: 100,
  })

  const pullRequest = await octokit.rest.pulls.create({
    owner,
    repo,
    head: branchName,
    base: 'canary',
    title: PR_TITLE,
    body: PR_BODY,
  })

  await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: pullRequest.data.number,
    labels: ['run-react-18-tests'],
  })

  console.log('Created pull request', pullRequest.url)

  const previousPullRequests = pullRequests.filter(({ title, user }) => {
    return title.includes(PR_TITLE) && user.login === 'nextjs-bot'
  })

  if (previousPullRequests.length) {
    for await (const previousPullRequest of previousPullRequests) {
      console.log(
        `Closing previous pull request: ${previousPullRequest.html_url}`
      )

      await octokit.rest.pulls.update({
        owner,
        repo,
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
