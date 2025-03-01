// @ts-check
import { setFailed, info } from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { WebClient } from '@slack/web-api'
import { BlockCollection, Divider, Section } from 'slack-block-builder'
import { formattedDate, ninetyDaysAgo } from '../lib/util.mjs'

async function run() {
  try {
    if (!process.env.GITHUB_TOKEN) throw new TypeError('GITHUB_TOKEN not set')
    if (!process.env.SLACK_TOKEN) throw new TypeError('SLACK_TOKEN not set')

    const octoClient = getOctokit(process.env.GITHUB_TOKEN)
    const slackClient = new WebClient(process.env.SLACK_TOKEN)

    const { owner, repo } = context.repo

    const { data: prs } = await octoClient.rest.search.issuesAndPullRequests({
      order: 'desc',
      per_page: 15,
      q: `repo:${owner}/${repo} -is:draft is:pr is:open created:>=${ninetyDaysAgo()}`,
      sort: 'reactions',
    })

    if (prs.items.length > 0) {
      let text = ''
      let count = 0

      prs.items.forEach((pr, i) => {
        if (pr.reactions) {
          if (pr.reactions.total_count > 1) {
            text += `${i + 1}. [<${pr.html_url}|#${pr.number}>, ${
              pr.reactions.total_count
            } reactions, ${formattedDate(pr.created_at)}]: ${pr.title}\n`
            count++
          }
        }
      })

      const blocks = BlockCollection([
        Section({
          text: `*A list of the top ${count} PRs sorted by the most reactions (> 1) over the last 90 days.*\n_Note: This :github2: <https://github.com/vercel/next.js/blob/canary/.github/workflows/popular.yml|workflow> → <https://github.com/vercel/next.js/blob/canary/.github/actions/next-repo-actions/src/popular-prs.ts|action> will run every Monday at 10AM UTC (6AM EST)._`,
        }),
        Divider(),
        Section({
          text,
        }),
      ])

      await slackClient.chat.postMessage({
        blocks,
        channel: '#next-info',
        icon_emoji: ':github:',
        username: 'GitHub Notifier',
      })

      info(`Posted to Slack!`)
    } else {
      info(`No popular PRs.`)
    }
  } catch (error) {
    setFailed(error)
  }
}

run()
