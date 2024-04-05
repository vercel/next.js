// @ts-check
import { context, getOctokit } from '@actions/github'
import { setFailed, info } from '@actions/core'
import { WebClient } from '@slack/web-api'
import { formattedDate, ninetyDaysAgo } from '../lib/util.mjs'

function generateBlocks(prs) {
  let text = ''
  let count = 0

  const blocks = [
    {
      type: 'divider',
    },
  ]

  prs.forEach((pr, i) => {
    if (pr.reactions['+1'] > 1) {
      text += `${i + 1}. [<${pr.html_url}|#${pr.number}>, :+1: ${
        pr.reactions['+1']
      }, ${formattedDate(pr.created_at)}]: ${pr.title}\n`
      count++
    }
  })

  blocks.unshift({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*A list of the top ${count} PRs sorted by most :+1: reactions (> 1) over the last 90 days.*\n_Note: This :github2: <https://github.com/vercel/next.js/blob/canary/.github/workflows/pull_request_popular.yml|workflow> → <https://github.com/vercel/next.js/blob/canary/.github/actions/next-repo-info/src/popular-prs.mjs|action> will run every Monday at 1PM UTC (9AM EST)._`,
    },
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
      q: `repo:${owner}/${repo} is:pr is:open created:>=${ninetyDaysAgo()}`,
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
      info(`No popular PRs`)
    }
  } catch (error) {
    setFailed(error)
  }
}

run()
