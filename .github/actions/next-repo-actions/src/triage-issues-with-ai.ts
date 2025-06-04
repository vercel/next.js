import { WebClient } from '@slack/web-api'
import { info, setFailed } from '@actions/core'
import { context } from '@actions/github'
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { BlockCollection, Divider, Section } from 'slack-block-builder'

import { getLatestCanaryVersion, getLatestVersion } from '../lib/util.mjs'

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new TypeError('OPENAI_API_KEY not set')
  if (!process.env.SLACK_TOKEN) throw new TypeError('SLACK_TOKEN not set')
  if (!process.env.VERCEL_PROTECTION_BYPASS)
    throw new TypeError('VERCEL_PROTECTION_BYPASS not set')

  const slackClient = new WebClient(process.env.SLACK_TOKEN)
  const model = 'gpt-4o'
  const channel = '#next-info'

  const issue = context.payload.issue

  let latestVersion: string
  let latestCanaryVersion: string

  try {
    latestVersion = await getLatestVersion()
    latestCanaryVersion = await getLatestCanaryVersion()

    const res = await fetch(
      'https://next-triage.vercel.sh/api/triage-guidelines',
      {
        method: 'GET',
        headers: {
          'x-vercel-protection-bypass': `${process.env.VERCEL_PROTECTION_BYPASS}`,
        },
      }
    )

    const guidelines = await res.text()

    const {
      object: { explanation, isSevere, number, title, html_url },
    } = await generateObject({
      model: openai(model),
      schema: z.object({
        explanation: z.string().describe('The explanation of the severity.'),
        isSevere: z.boolean().describe('Whether the issue is severe.'),
        number: z.number().describe('The issue number.'),
        title: z.string().describe('The issue title.'),
        html_url: z.string().describe('The issue html URL.'),
      }),
      system:
        'Your job is to determine the severity of a GitHub issue using the triage guidelines and the latest versions of Next.js. Succinctly explain why you chose the severity, without paraphrasing the triage guidelines. Report to Slack the explanation only if the severity is considered severe.',
      prompt:
        `Here are the triage guidelines: ${guidelines}` +
        `Here is the latest version of Next.js: ${latestVersion}` +
        `Here is the latest canary version of Next.js: ${latestCanaryVersion}` +
        `Here is the GitHub issue: ${JSON.stringify(issue)}`,
    })

    // the ai determined that the issue was severe enough to report on slack
    if (isSevere) {
      const blocks = BlockCollection([
        Section({
          text: `:github2: <${html_url}|#${number}>: ${title}\n_Note: This issue was evaluated and reported on Slack with *${model}*._`,
        }),
        Divider(),
        Section({
          text: `_${explanation}_`,
        }),
      ])

      await slackClient.chat.postMessage({
        blocks,
        channel,
        icon_emoji: ':github:',
        username: 'GitHub Notifier',
      })

      info('Reported to Slack!')
    }

    // the ai will also provide a reason why the issue was not severe enough to report on slack
    info(
      `Explanation: ${explanation}\nhtml_url: ${html_url}\nnumber: ${number}\ntitle: ${title}`
    )
  } catch (error) {
    setFailed(error)
  }
}

main()
