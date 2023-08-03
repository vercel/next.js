// @ts-check
import { context, getOctokit } from '@actions/github'
import { setFailed } from '@actions/core'
import { WebClient } from '@slack/web-api'

async function run() {
  try {
    if (!process.env.GITHUB_TOKEN) throw new TypeError('GITHUB_TOKEN not set')
    if (!process.env.SLACK_TOKEN) throw new TypeError('SLACK_TOKEN not set')

    const octoClient = getOctokit(process.env.GITHUB_TOKEN)
    const slackClient = new WebClient(process.env.SLACK_TOKEN)

    const { owner, repo } = context.repo
    const prs = await octoClient.rest.search.issuesAndPullRequests({
      q: `is:pr is:open review:approved repo:${owner}/${repo}`,
    })

    await slackClient.chat.postMessage({
      channel: '#team-next-js',
      text: `🤖 Pending PRs for Next.js. There are [${prs.data.total_count} PRs] awaiting merge(https://github.com/vercel/next.js/pulls?q=is%3Apr+is%3Aopen+review%3Aapproved).`,
      mrkdwn: true,
      username: 'GitHub Notifier',
      icon_emoji: ':github:',
    })
  } catch (error) {
    setFailed(error)
  }
}

run()
