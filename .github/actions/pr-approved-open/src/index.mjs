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

    const prs = await octoClient.rest.pulls.list({
      repo: context.repo.repo,
      owner: context.repo.owner,
    })

    await slackClient.chat.postMessage({
      channel: '#team-next-js',
      text: `${prs.data.length} PR(s) are awaiting merge.`,
      username: 'GitHub Notifier',
      icon_emoji: ':github:',
    })
  } catch (error) {
    setFailed(error)
  }
}

run()
