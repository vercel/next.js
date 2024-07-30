import { WebClient } from '@slack/web-api'
import * as path from 'node:path'
import { readFileSync } from 'node:fs'
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

  const slackClient = new WebClient(process.env.SLACK_TOKEN)
  const model = 'gpt-4o'

  const issue = context.payload.issue
  const filePath = path.join(
    process.cwd(),
    '.github/actions/next-repo-actions/lib/triage_guidelines.txt'
  )
  const fileText = readFileSync(filePath, 'utf8')

  let latestVersion
  let latestCanaryVersion

  try {
    latestVersion = await getLatestVersion()
    latestCanaryVersion = await getLatestCanaryVersion()

    const result = await generateText({
      model: openai(model),
      maxAutomaticRoundtrips: 1,
      tools: {
        report_to_slack: tool({
          description: 'Report to Slack if a GitHub issue is severe enough.',
          parameters: issueSchema,
          execute: async ({ issue }) => ({
            html_url: issue.html_url,
            number: issue.number,
            title: issue.title,
          }),
        }),
      },
      prompt: `${JSON.stringify(issue)}\n${fileText}\nlatestVersion: ${latestVersion}\nlatestCanaryVersion: ${latestCanaryVersion}\nWith the above GitHub issue (JSON), the triage guidelines for determining whether an issue is severe, and the latest versions of Next.js, can you determine whether the given issue is severe enough to flag on Slack? If severe enough, report to Slack with an approximately 300 character summary (don't repeat the triage guidelines while doing so) of why you think it is severe enough to report to Slack. If not severe enough, do not report on Slack.`,
    })

    // the ai determined that the issue was severe enough to report on slack
    if (result.roundtrips.length > 1) {
      const blocks = BlockCollection([
        Section({
          text: `:github2: <${result.roundtrips[0].toolResults[0].result.html_url}|#${result.roundtrips[0].toolResults[0].result.number}>: ${result.roundtrips[0].toolResults[0].result.title}\n_Note: This issue was summarized and reported on Slack with the *${model}* model._`,
        }),
        Divider(),
        Section({
          text: `_${result.text}_`,
        }),
      ])

      await slackClient.chat.postMessage({
        blocks,
        channel: '#next-info',
        icon_emoji: ':github:',
        username: 'GitHub Notifier',
      })
    } else {
      info('The issue was not severe enough to report on Slack.')
    }
  } catch (error) {
    setFailed(error)
  }
}

main()
