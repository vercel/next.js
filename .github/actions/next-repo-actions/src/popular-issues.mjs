// @ts-check
import { context, getOctokit } from '@actions/github'
import { info } from '@actions/core'

async function run() {
  if (!process.env.GITHUB_TOKEN) throw new TypeError('GITHUB_TOKEN not set')

  const octoClient = getOctokit(process.env.GITHUB_TOKEN)

  const { owner, repo } = context.repo
  const { data } = await octoClient.rest.search.issuesAndPullRequests({
    order: 'desc',
    per_page: 100,
    q: `repo:${owner}/${repo} is:issue created:2024-07-29..2024-08-05 `,
  })

  info(`Found ${data.items.length} issues`)
  // console.log(JSON.stringify(data.items))
}

run()
