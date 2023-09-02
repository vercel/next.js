/**
 * This closes an issue if it doesn't have an expected reproduction.
 */

// @ts-check
import { setFailed } from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const __dirname = `${process.env.GITHUB_WORKSPACE}/.github/actions/issue-validator/repro-link`

async function run() {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('No GITHUB_TOKEN provided')

  const { issue } = context.payload
  if (!issue) return console.log('Not an issue, exiting')

  const { body: issue_body } = issue
  if (!issue_body) return console.log('Could not get issue body, exiting')

  // https://github.com/vercel/next.js/blob/canary/.github/ISSUE_TEMPLATE/1.bug_report.yml?plain=1

  const start =
    '### Link to the code that reproduces this issue or a replay of the bug'
  const end = '### To Reproduce'
  const linkRe = new RegExp(`${start}(.*)${end}`, 'is')
  const match = issue_body.match(linkRe)?.[1]?.trim()

  if (await hasRepro(match)) {
    console.log(`Issue #${issue.number} contains a valid reproduction link`)
    return
  }

  // A client to load data from GitHub
  const { rest: client } = getOctokit(token)

  console.log(
    `Issue #${issue.number} does not contain a valid reproduction link, closing/commenting`
  )

  // Close the issue
  await client.issues.update({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issue.number,
    state: 'closed',
  })

  await client.issues.addLabels({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issue.number,
    labels: ['invalid link'],
  })

  // Comment on the issue
  await client.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issue.number,
    body: readFileSync(join(__dirname, 'invalid-link.md'), 'utf8'),
  })

  // Lock to avoid piling up comments/reactions we do not monitor
  await client.issues.lock({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issue.number,
  })
}

run().catch(setFailed)

/** @param {string|null|undefined} link */
async function hasRepro(link) {
  if (!link) return false
  try {
    const url = new URL(link)
    if (
      !['github.com', 'codesandbox.io', 'app.replay.io'].includes(url.hostname)
    )
      return false
    const { status } = await fetch(link)
    // Verify that it's not a private repo/sandbox
    // We allow 500, in case it's downtime on one of the services
    return status < 400 || status >= 500
  } catch {
    return false
  }
}
