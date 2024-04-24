// @ts-check
import { context, getOctokit } from '@actions/github'
import { info, setFailed } from '@actions/core'
import { WebClient } from '@slack/web-api'

import { formattedDate, ninetyDaysAgo } from '../lib/util.mjs'

/**
 * @typedef Search
 * @property {Node[]} nodes
 *
 * @typedef Node
 * @property {number} number
 * @property {string} title
 * @property {string} url
 * @property {number} upvoteCount
 *
 * @typedef {{ search: Search }} GraphQLResponse
 *
 * @typedef Item
 * @property {string} title
 * @property {number} number
 * @property {string} html_url
 * @property {string} created_at
 * @property {number} reactions
 */

/** @param {Item[]} items */
function generateBlocks(items) {
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*A list of the top 15 feature requests sorted by reactions over the last 90 days.*\n_Note: This :github2: <https://github.com/vercel/next.js/blob/canary/.github/workflows/popular.yml|workflow> → <https://github.com/vercel/next.js/blob/canary/.github/actions/next-repo-info/src/feature-requests.mjs|action> will run every Monday at 1PM UTC (9AM EST)._',
      },
    },
    {
      type: 'divider',
    },
  ]

  let text = ''

  items.forEach((item, i) => {
    text += `${i + 1}. [<${item.html_url}|#${item.number}>, :+1: ${
      item.reactions['+1']
    }, ${formattedDate(item.created_at)}]: ${item.title}\n`
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

    /** @type {GraphQLResponse} */
    const { search } = await octoClient.graphql(`{
      search(
        type: DISCUSSION
        first: 15
        query: "repo:${owner}/${repo} is:open category:Ideas sort:top created:>=${ninetyDaysAgo()}"
      ) {
        nodes {
          ... on Discussion {
            number
            title
            url
            upvoteCount
          }
        }
      }
    }`)

    const items = search.nodes.map((node) => ({
      title: node.title,
      number: node.number,
      html_url: node.url,
      created_at: new Date().toISOString(),
      reactions: node.upvoteCount,
    }))

    await slackClient.chat.postMessage({
      blocks: generateBlocks(items),
      channel: '#team-next-js',
      icon_emoji: ':github:',
      username: 'GitHub Notifier',
    })

    info(`Posted to Slack!`)
  } catch (error) {
    setFailed(error)
  }
}

run()
