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
  ]
  issues.forEach((issue) => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `• ${issue.title}: <${issue.html_url}|#${issue.number}>`,
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

    const res = await octoClient.rest.search.issuesAndPullRequests({
      per_page: 15,
      q: `repo:${owner}/${repo}+is:issue+is:open`,
    })

    // https://github.com/search?q=+repo%3Avercel%2Fnext.js+is%3Aissue+is%3Aopen+created%3A%3E%3D2023-12-11+sort%3Areactions-%2B1-desc&type=issues
    // ${owner}/${repo}+is:issue+is:open+created:>=${oneMonthAgo} sort:reactions-+1-desc

    console.log('[test] res =', res)

    if (res.data.items.length > 0) {
      await slackClient.chat.postMessage({
        blocks: generateBlocks(res.data.items),
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
