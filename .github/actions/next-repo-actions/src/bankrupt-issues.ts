import { info, setFailed } from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { WebClient } from '@slack/web-api'
import { BlockCollection, Section } from 'slack-block-builder'

async function main() {
  if (!process.env.GITHUB_TOKEN) throw new TypeError('GITHUB_TOKEN not set')
  if (!process.env.CREATED) throw new TypeError('CREATED not set')
  if (!process.env.SLACK_TOKEN) throw new TypeError('SLACK_TOKEN not set')

  const octokit = getOctokit(process.env.GITHUB_TOKEN)
  const slackClient = new WebClient(process.env.SLACK_TOKEN)

  const { owner, repo } = context.repo
  const createdQuery = process.env.CREATED
  const dateRange = createdQuery.split('..').join(' to ')
  const body = `

We are in the process of closing issues dating from ${dateRange} to improve our focus on the most relevant and actionable problems.

**_Why are we doing this?_**

Stale issues often lack recent updates and clear reproductions, making them difficult to address effectively. Our objective is to prioritize the most upvoted and actionable issues that have up-to-date reproductions, enabling us to resolve bugs more efficiently.

**_Why these issues?_**

Issues dating from ${dateRange} are likely to be outdated and less relevant to the current state of the codebase. By closing these older stale issues, we can better focus our efforts on more recent and relevant problems, ensuring a more effective and streamlined workflow.

If your issue is still relevant, please reopen it using our [bug report template](https://github.com/vercel/next.js/issues/new?assignees=&labels=bug&projects=&template=1.bug_report.yml). Be sure to include any important context from the original issue in your new report.

Thank you for your understanding and contributions.

Best regards,
The Next.js Team
  `

  let issues: number[] = []

  try {
    const { data } = await octokit.rest.search.issuesAndPullRequests({
      q: `repo:${owner}/${repo} is:issue is:open created:${createdQuery}`,
    })

    issues = data.items.map((issue) => {
      return issue.number
    })

    info(`issues = ${issues}`)
    info(`${issues.length} issues found! Attempting to close these issues...`)

    issues.forEach(async (issue_number) => {
      // assign the issue to samcx
      await octokit.rest.issues.addAssignees({
        owner,
        repo,
        issue_number,
        assignees: ['samcx'],
      })

      // add a comment
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number,
        body,
      })

      // close the issue
      await octokit.rest.issues.update({
        owner,
        repo,
        issue_number,
        state: 'closed',
      })
    })

    info(`Those ${issues.length} issues have been successfully closed.`)

    const blocks = BlockCollection([
      Section({
        text: `We just bankrupted *${issues.length}* issues from ${dateRange}.\n_Note: This :github2: <https://github.com/vercel/next.js/actions/workflows/issue_bankrupt.yml|workflow> is ran manually with an inputed created query. To see which issues were closed, check the latest workflow <https://github.com/vercel/next.js/actions/workflows/issue_bankrupt.yml|run>._`,
      }),
    ])

    await slackClient.chat.postMessage({
      blocks,
      channel: '#coord-next-triage',
      icon_emoji: ':github:',
      username: 'GitHub Notifier',
    })
  } catch (error) {
    setFailed(error)
  }
}

main()
