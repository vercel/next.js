// @ts-check
import { context, getOctokit } from '@actions/github'
import { info, setFailed } from '@actions/core'
import { WebClient } from '@slack/web-api'
import { formattedDate, ninetyDaysAgo } from '../lib/util.mjs'

function generateBlocks(issues) {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*A list of the top 15 issues sorted by the most reactions over the last 90 days.*\n_Note: This :github2: <https://github.com/vercel/next.js/blob/canary/.github/workflows/popular.yml|workflow> → <https://github.com/vercel/next.js/blob/canary/.github/actions/next-repo-actions/src/popular-issues.mjs|action> will run every Monday at 10AM UTC (6AM EST). These issues are automatically synced to Linear._',
      },
    },
    {
      type: 'divider',
    },
  ]

  let text = ''

  issues.forEach((issue, i) => {
    text += `${i + 1}. [<${issue.html_url}|#${issue.number}>, ${
      issue.reactions.total_count
    } reactions, ${formattedDate(issue.created_at)}]: ${issue.title}\n`
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

    const { owner, repo } = context.repo
    const { data } = await octoClient.rest.search.issuesAndPullRequests({
      order: 'desc',
      per_page: 15,
      q: `repo:${owner}/${repo} is:issue is:open created:>=${ninetyDaysAgo()}`,
      sort: 'reactions',
    })

    if (data.items.length > 0) {
      data.items.forEach(async (item) => {
        const labelType = item.labels.some(
          (label) => label.name === 'Turbopack'
        )
          ? 'turbopack'
          : 'next'
        const syncLabel = `linear: ${labelType}`

        await octoClient.rest.issues.addLabels({
          owner,
          repo,
          issue_number: item.number,
          labels: [syncLabel],
        })
      })

      await slackClient.chat.postMessage({
        blocks: generateBlocks(data.items),
        channel: '#coord-next-triage',
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
