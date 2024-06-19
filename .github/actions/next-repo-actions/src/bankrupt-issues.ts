import { context, getOctokit } from '@actions/github'
import { info, setFailed } from '@actions/core'

async function main() {
  if (!process.env.GITHUB_TOKEN) throw new TypeError('GITHUB_TOKEN not set')
  if (!process.env.CREATED) throw new TypeError('CREATED not set')

  const octokit = getOctokit(process.env.GITHUB_TOKEN)
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

  info(`created = ${createdQuery}`)
  info(`date range = ${dateRange}`)
  info(`body = ${body}`)

  // try {
  //   const { data } = await octokit.rest.search.issuesAndPullRequests({
  //     q: `repo:${owner}/${repo} is:issue is:open created:${createdQuery}`,
  //   })

  //   issues = data.items.map((issue) => issue.number)

  //   info(`issues = ${issues}`)
  //   info(`${issues.length} issues found!`)

  //   issues.forEach(async (issue_number) => {
  //     // assign the issue to samcx
  //     await octokit.rest.issues.addAssignees({
  //       owner,
  //       repo,
  //       issue_number,
  //       assignees: ['samcx'],
  //     })

  //     // add a comment
  //     await octokit.rest.issues.createComment({
  //       owner,
  //       repo,
  //       issue_number,
  //       body,
  //     })

  //     // close the issue
  //     await octokit.rest.issues.update({
  //       owner,
  //       repo,
  //       issue_number,
  //       state: 'closed',
  //     })
  //   })

  //   info(`${issues.length} issues closed.`)
  // } catch (error) {
  //   setFailed(error)
  // }
}

main()
