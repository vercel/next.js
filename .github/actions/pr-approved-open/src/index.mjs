// @ts-check
import { context, getOctokit } from '@actions/github'
import { setFailed, info } from '@actions/core'
import { WebClient } from '@slack/web-api'

async function run() {
  try {
    if (!process.env.GITHUB_TOKEN) throw new TypeError('GITHUB_TOKEN not set')
    if (!process.env.SLACK_TOKEN) throw new TypeError('SLACK_TOKEN not set')

    const octoClient = getOctokit(process.env.GITHUB_TOKEN)
    const slackClient = new WebClient(process.env.SLACK_TOKEN)

    const { owner, repo } = context.repo
    const prs = await octoClient.rest.search.issuesAndPullRequests({
      q: `repo:${owner}/${repo}+is:pr+is:open+review:approved -is:draft`,
    })

    const pendingPRs = prs.data.total_count

    if (pendingPRs) {
      await slackClient.chat.postMessage({
        channel: '#coord-next-turbopack',
        text: `🤖 Pending PRs for Next.js: There are <https://github.com/vercel/next.js/pulls?q=is%3Apr+is%3Aopen+review%3Aapproved+-is%3Adraft|${prs.data.items.length} PRs> awaiting merge.`,
        username: 'GitHub Notifier',
        icon_emoji: ':github:',
      })

      info(`Posted to Slack: ${pendingPRs} pending PRs`)
    }
    info(`No pending PRs`)
  } catch (error) {
    setFailed(error)
  }
}

run()
