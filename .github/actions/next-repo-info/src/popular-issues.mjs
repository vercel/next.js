// @ts-check
import { context, getOctokit } from '@actions/github'
import { setFailed, info } from '@actions/core'
import { WebClient } from '@slack/web-api'

// Get the date one month ago (YYYY-MM-DD)
function getOneMonthAgoDate() {
  const date = new Date()
  date.setMonth(date.getMonth() - 1)
  return date.toISOString().split('T')[0]
}

function generateBlocks(issues) {
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: '*Top 15 issues:*' } },
    { type: 'divider' },
  ]
  issues.forEach((issue) => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `• <${issue.html_url}|#${issue.number}>: ${issue.title}`,
      },
    })
  })
  return blocks
}

async function run() {
  try {
    if (!process.env.GITHUB_TOKEN) throw new TypeError('GITHUB_TOKEN not set')
    if (!process.env.SLACK_TOKEN) throw new TypeError('SLACK_TOKEN not set')

    const octoClient = getOctokit(process.env.GITHUB_TOKEN)
    const slackClient = new WebClient(process.env.SLACK_TOKEN)

    const { owner, repo } = context.repo
    const oneMonthAgo = getOneMonthAgoDate()

    const { data } = await octoClient.rest.search.issuesAndPullRequests({
      per_page: 15,
      q: `repo:${owner}/${repo} is:issue is:open created:>=${oneMonthAgo} sort:reactions-+1-desc`,
    })

    console.log('[test] data.items =', data.items)

    if (data.items.length > 0) {
      await slackClient.chat.postMessage({
        blocks: generateBlocks(data.items),
        channel: '#next-js-repo-updates',
        icon_emoji: ':github:',
        username: 'GitHub',
      })

      info(`Posted to Slack!`)
    }
    info(`No popular issues`)
  } catch (error) {
    setFailed(error)
  }
}

run()
