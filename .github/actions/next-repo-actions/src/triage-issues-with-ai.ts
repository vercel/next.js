import { WebClient } from '@slack/web-api'
import { info, setFailed } from '@actions/core'
import { context } from '@actions/github'
import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { BlockCollection, Divider, Section } from 'slack-block-builder'

import { getLatestCanaryVersion, getLatestVersion } from '../lib/util.mjs'
import { issueSchema } from '../lib/types'

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
  let html_url: string
  let number: number
  let title: string

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

    const result = await generateText({
      model: openai(model),
      maxAutomaticRoundtrips: 1,
      tools: {
        report_to_slack: tool({
          description: 'Report to Slack.',
          parameters: issueSchema,
          execute: async ({ issue }) => {
            html_url = issue.html_url
            number = issue.number
            title = issue.title

            return { html_url, number, title }
          },
        }),
      },
      system:
        `Your job is to determine the severity of a GitHub issue using the triage guidelines and the latest versions of Next.js.` +
        `Succintly explain why you chose the severity, without paraphrasing the triage guidelines.` +
        `Here are the triage guidelines: ${guidelines}` +
        `Here is the latest version of Next.js: ${latestVersion}` +
        `Here is the latest canary version of Next.js: ${latestCanaryVersion}`,
      prompt: `${JSON.stringify(issue)}\nDetermine the severity of the above GitHub issue. If the severity is severe, report it to Slack.`,
    })

    // the ai determined that the issue was severe enough to report on slack
    if (result.roundtrips.length > 1) {
      const blocks = BlockCollection([
        Section({
          text: `:github2: <${html_url}|#${number}>: ${title}\n_Note: This issue was evalulated and reported on Slack with *${model}*._`,
        }),
        Divider(),
        Section({
          text: `_${result.text}_`,
        }),
      ])

      await slackClient.chat.postMessage({
        blocks,
        channel,
        icon_emoji: ':github:',
        username: 'GitHub Notifier',
      })

      info(`${result.text}`)
    } else {
      // the ai will also provide a reason why the issue was not severe enough to report on slack
      info(`${result.text}`)
    }
  } catch (error) {
    setFailed(error)
  }
}

main()
