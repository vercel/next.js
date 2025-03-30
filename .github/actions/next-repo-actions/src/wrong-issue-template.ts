import { info, setFailed } from '@actions/core'
import { context, getOctokit } from '@actions/github'

async function main() {
  if (!process.env.GITHUB_TOKEN) throw new TypeError('GITHUB_TOKEN not set')

  const octokit = getOctokit(process.env.GITHUB_TOKEN)

  const { owner, repo } = context.repo
  const issue = context.payload.issue
  const body = `

This issue has been closed due to the incorrect issue template being used. Please make sure to submit a new issue using the [correct issue template](https://github.com/vercel/next.js/issues/new?assignees=&labels=bug&projects=&template=1.bug_report.yml). This will ensure that we have all the necessary information to triage your issue.

Thank you for your understanding and contributions.

Best regards,
The Next.js Team
  `

  try {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issue.number,
      body,
    })

    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: issue.number,
      state: 'closed',
    })

    info(
      `Issue #${issue.number}, which was opened with the incorrect template, has been successfully closed.`
    )
  } catch (error) {
    setFailed(error)
  }
}

main()
