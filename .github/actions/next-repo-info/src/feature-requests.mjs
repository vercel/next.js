// @ts-check
import { info, setFailed } from '@actions/core'
import { WebClient } from '@slack/web-api'
import HTMLParser from 'node-html-parser'

import { formattedDate, ninetyDaysAgo } from '../lib/util.mjs'

/**
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
    if (!process.env.SLACK_TOKEN) throw new TypeError('SLACK_TOKEN not set')

    const slackClient = new WebClient(process.env.SLACK_TOKEN)

    const params = new URLSearchParams({
      discussions_q: `is:open sort:top created:>=${ninetyDaysAgo()} category:Ideas`,
    })
    const html = await (
      await fetch(
        `https://github.com/vercel/next.js/discussions/categories/ideas?${params}`
      )
    ).text()
    const root = HTMLParser.parse(html)

    /** @type {Item[]} */
    const items = [
      ...root.querySelectorAll('[aria-labelledby="discussions-list"] li'),
    ]
      .slice(0, 15)
      .map((item) => {
        const link = item.querySelector('h3 a')?.getAttribute('href') ?? ''
        return {
          title: item.querySelector('h3')?.innerText ?? '',
          number: parseInt(link.split('/').at(-1) ?? '', 10),
          html_url: `https://github.com${link}`,
          created_at: formattedDate(
            item.querySelector('relative-time')?.getAttribute('datetime') ?? ''
          ),
          reactions: parseInt(
            item.querySelector('button')?.innerText.split('\n')[0] ?? '',
            10
          ),
        }
      })

    if (items.length > 0) {
      await slackClient.chat.postMessage({
        blocks: generateBlocks(items),
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
