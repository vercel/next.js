import { context, getOctokit } from '@actions/github'
import { WebClient } from '@slack/web-api'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { info, setFailed } from '@actions/core'
import { BlockCollection, Section } from 'slack-block-builder'

function aWeekAgo() {
  const date = new Date()
  date.setDate(date.getDate() - 7)
  return date.toISOString().split('T')[0]
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new TypeError('OPENAI_API_KEY not set')
  if (!process.env.GITHUB_TOKEN) throw new TypeError('GITHUB_TOKEN not set')
  if (!process.env.SLACK_TOKEN) throw new TypeError('SLACK_TOKEN not set')

  const octokit = getOctokit(process.env.GITHUB_TOKEN)
  const slackClient = new WebClient(process.env.SLACK_TOKEN)

  const { owner, repo } = context.repo
  const model = 'gpt-4o'
  const channel = '#coord-next-triage'

  try {
    const { data } = await octokit.rest.search.issuesAndPullRequests({
      per_page: 100,
      q: `repo:${owner}/${repo} is:issue created:>=${aWeekAgo()}`,
    })

    // const result = await generateText({
    //   model: openai(model),

    // })
  } catch (error) {
    setFailed(error)
  }
}

main()
