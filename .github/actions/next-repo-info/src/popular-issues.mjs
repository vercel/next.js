// @ts-check
import { context, getOctokit } from '@actions/github'
import { setFailed, info } from '@actions/core'
import { WebClient } from '@slack/web-api'

// Get the date 90 days ago (YYYY-MM-DD)
function getNinetyDaysAgoDate() {
  const date = new Date()
  date.setDate(date.getDate() - 90)
  return date.toISOString().split('T')[0]
}

function generateBlocks(issues) {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*A list of the top 15 issues sorted by most :+1: reactions over the last 90 days.*\n_Note: This :github2: workflow will run every Monday at 1PM UTC (9AM EST)._',
      },
    },
    {
      type: 'divider',
    },
  ]
  let text = ''
  issues.forEach((issue, i) => {
    text += `${i + 1}. [<${issue.html_url}|#${issue.number}>, :+1: ${
      issue.reactions['+1']
    }]: ${issue.title}\n`
  })
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: text,
    },
  })
  return blocks
}

async function run() {
  try {
    if (!process.env.GITHUB_TOKEN) throw new TypeError('GITHUB_TOKEN not set')
    if (!process.env.SLACK_TOKEN) throw new TypeError('SLACK_TOKEN not set')

    const octoClient = getOctokit(process.env.GITHUB_TOKEN)
    const slackClient = new WebClient(process.env.SLACK_TOKEN)

    const ninetyDaysAgo = getNinetyDaysAgoDate()
    const { owner, repo } = context.repo
    const { data } = await octoClient.rest.search.issuesAndPullRequests({
      order: 'desc',
      per_page: 15,
      q: `repo:${owner}/${repo} is:issue is:open created:>=${ninetyDaysAgo}`,
      sort: 'reactions-+1',
    })

    if (data.items.length > 0) {
      await slackClient.chat.postMessage({
        blocks: generateBlocks(data.items),
        channel: '#team-next-js',
        icon_emoji: ':github:',
        username: 'GitHub Notifier',
      })

      info(`Posted to Slack!`)
    } else {
      info(`No popular issues`)
    }
  } catch (error) {
    setFailed(error)
  }
}

run()
