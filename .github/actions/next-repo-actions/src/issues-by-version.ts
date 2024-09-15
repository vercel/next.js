import { info, setFailed } from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { WebClient } from '@slack/web-api'
import { BlockCollection, Divider, Section } from 'slack-block-builder'

async function main() {
  if (!process.env.GITHUB_TOKEN) throw new TypeError('GITHUB_TOKEN not set')
  if (!process.env.SLACK_TOKEN) throw new TypeError('SLACK_TOKEN not set')
  if (!process.env.VERSION) throw new TypeError('VERSION not set')

  const octokit = getOctokit(process.env.GITHUB_TOKEN)
  const slackClient = new WebClient(process.env.SLACK_TOKEN)

  const { owner, repo } = context.repo
  const version = process.env.VERSION

  try {
    const { data: issues } = await octokit.rest.search.issuesAndPullRequests({
      order: 'desc',
      per_page: 25,
      q: `repo:${owner}/${repo} is:issue is:open`,
    })

    const filteredIssues = issues.items.filter(
      (issue) => issue.body && issue.body.includes(`${version}`)
    )

    if (filteredIssues.length > 0) {
      const blocks = BlockCollection([
        Section({
          text: `*A list of the most recently created, open issues that are on v${version}.*\n_Note: This :github2: <https://github.com/vercel/next.js/blob/canary/.github/workflows/issue_version.yml|workflow> queries the 50 most recent issues, then filters them to only include issues that mention v${version}._`,
        }),
        Divider(),
        Section({
          text: filteredIssues
            .map(
              (issue, i) =>
                `${i + 1}. <${issue.html_url}|#${issue.number}>: ${issue.title}`
            )
            .join('\n'),
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
      info(`No issues found for ${version}.`)
    }
  } catch (error) {
    setFailed(error)
  }
}

main()
