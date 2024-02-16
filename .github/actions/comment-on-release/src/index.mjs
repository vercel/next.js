// @ts-check

import { debug } from '@actions/core'
import { setFailed, info } from '@actions/core'
import { context, getOctokit } from '@actions/github'

const distTag = 'canary'
// Regular expression to match "closes #1234" or "fixes #1234" patterns
const shorthandPattern = /\b(closes|fixes)\s+#(\d+)/gi
// Regular expression to match full URL syntax for issues
// e.g., "https://github.com/owner/repo/issues/1234"
const urlPattern =
  /\b(closes|fixes)\s+https:\/\/github\.com\/[\w-]+\/[\w-]+\/issues\/(\d+)/gi

/* @returns {Set<string>} */
function parseForIssues(string) {
  return new Set(
    [...string.matchAll(shorthandPattern), ...string.matchAll(urlPattern)].map(
      (match) => match[1]
    )
  )
}

async function run() {
  if (!process.env.GITHUB_TOKEN) throw new TypeError('GITHUB_TOKEN not set')
  /** @see https://docs.github.com/en/webhooks/webhook-events-and-payloads#workflow_run */
  const { repo, payload } = context

  if (payload.workflow_run.conclusion !== 'success')
    return info('Workflow run is not successful, skipping')

  const res = await fetch('https://registry.npmjs.org/-/package/next/dist-tags')
  const version = (await res.json())[distTag]
  const tag = `v${version}`
  const releaseNotesURL = `https://github.com/${repo.owner}/${repo.repo}/releases/tag/${tag}`

  const { rest: client } = getOctokit(process.env.GITHUB_TOKEN)

  const { data: release } = await client.repos.getReleaseByTag({ ...repo, tag })

  const prNumbers = release.body
    ?.match(/: #\d+$/gm)
    ?.map((s) => parseInt(s.replace(': #', ''), 10))
    .filter(Boolean)

  if (!prNumbers?.length)
    return info('No PRs found in release notes. Skipping.')

  info(`Found PRs: ${prNumbers.join(', ')}`)

  for await (const pull_number of prNumbers) {
    debug(`Fetching PR #${pull_number}`)
    const { data: pr } = await client.pulls.get({ ...repo, pull_number })

    const issues = parseForIssues(pr.body)
    debug(
      `Found associated issues in PR description: ${[...issues].join(', ')}`
    )

    const body = `This issue was closed via #${pull_number} which is part of the release ${version}. [Release notes](${releaseNotesURL}). To see if the issue is fixed, please install the canary version of Next.js by running \`npm install next@canary\`. If the issue still persists, please open a new bug report.`
    for await (const issue_number of issues) {
      debug(`Adding comment to issue #${issue_number}`)
      await client.issues.createComment({ ...repo, issue_number, body })
      debug(`Added comment to issue #${issue_number}`)
      await client.issues.lock({
        ...repo,
        issue_number,
        lock_reason: 'resolved',
      })
      debug(`Locked issue #${issue_number} as resolved.`)
    }
    info(`Processed PR #${pull_number}`)
  }

  info(`Processed all PRs from the release ${releaseNotesURL}`)
}

run().catch((e) => setFailed(e.message))
