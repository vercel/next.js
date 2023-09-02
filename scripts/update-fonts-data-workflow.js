const { promisify } = require('util')
const { Octokit } = require('octokit')
const { exec: execOriginal } = require('child_process')

const exec = promisify(execOriginal)

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''

if (!GITHUB_TOKEN) {
  console.log('missing GITHUB_TOKEN env')
  process.exit(1)
}

async function main() {
  const octokit = new Octokit({ auth: GITHUB_TOKEN })
  const branchName = `update/fonts-data-${Date.now()}`

  await exec(`node scripts/update-google-fonts.js`)

  await exec(`git config user.name "vercel-release-bot"`)
  await exec(`git config user.email "infra+release@vercel.com"`)
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
    title: `Update font data`,
    body: `This auto-generated PR updates font data with latest available`,
  })

  console.log('Created pull request', pullRequest.url)

  const previousPullRequests = pullRequests.filter(({ title }) => {
    return title.startsWith('Update font data')
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

main().catch(console.error)
