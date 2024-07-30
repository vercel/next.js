import * as path from 'node:path'
import { readFileSync } from 'node:fs'
import { setFailed } from '@actions/core'
import { context } from '@actions/github'
import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'

import { getLatestCanaryVersion, getLatestVersion } from '../lib/util.mjs'
import { issueSchema } from '../lib/types'

async function main() {
  if (!process.env.SLACK_TOKEN) throw new TypeError('SLACK_TOKEN not set')
  if (!process.env.OPENAI_API_KEY) throw new TypeError('OPENAI_API_KEY not set')

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
      model: openai('gpt-4o'),
      maxAutomaticRoundtrips: 1,
      tools: {
        report_to_slack: tool({
          description:
            'Report to Slack if a GitHub issue is severe enough to flag.',
          parameters: issueSchema,
          execute: async () => ({
            asSevere: true,
          }),
        }),
      },
      prompt: `${JSON.stringify(issue)}\n${fileText}\nlatestVersion: ${latestVersion}\nlatestCanaryVersion: ${latestCanaryVersion}\nith the above GitHub issue (JSON) and the triage guidelines for determining whether an issue is severe, can you determine whether the given issue is severe enough to flag on Slack? If severe enough, report to Slack with an approximately 300 character summary of why you think it is severe enough to flag on Slack. If not, do not report on Slack.`,
    })
  } catch (error) {
    setFailed(error)
  }
}

main()
