// @ts-check
import * as github from '@actions/github'
import * as core from '@actions/core'

async function run() {
  try {
    if (!process.env.GITHUB_TOKEN) {
      core.setFailed('GITHUB_TOKEN is not set')
    }

    // @ts-ignore
    const client = github.getOctokit(process.env.GITHUB_TOKEN).rest

    /**
     * @param {string} label
     * @param {string} comment
     */
    function notifyOnIssue(label, comment) {
      const issue = {
        ...github.context.repo,
        issue_number: github.context.issue.number,
      }

      return Promise.all([
        client.issues.addLabels({ ...issue, labels: [label] }),
        client.issues.createComment({ ...issue, body: comment }),
      ])
    }

    const body = github.context.payload.issue?.body
    if (body) {
      const isVerifyCanaryChecked = body.includes(
        '- [X] I verified that the issue exists in Next.js canary release'
      )
      const reportedNextVersion = body.match(
        /Relevant packages:\n      next: (?<version>\d+\.\d+\.\d+)/
      )?.groups?.version

      if (!reportedNextVersion) {
        // REVIEW: Should we add a label here?
        return
      }

      if (!isVerifyCanaryChecked) {
        // This can happen if the issue was from a comment in another issue or discussion.
        return await notifyOnIssue(
          'please verify canary',
          'Please verify your issue against `next@canary`. The canary version of Next.js ships daily and includes all features and fixes that have not been released to the stable version yet. Think of canary as a public beta. Some issues may already be fixed in the canary version, so please verify that your issue reproduces. If the issue is resolved on the canary version, this issue can be closed.'
        )
      }

      const {
        data: { tag_name: lastVersion },
      } = await client.repos.getLatestRelease(github.context.repo)

      if (reportedNextVersion !== lastVersion) {
        return await notifyOnIssue(
          'please verify canary',
          'The reported Next.js version did not match the latest `next@canary` version. The canary version of Next.js ships daily and includes all features and fixes that have not been released to the stable version yet. Think of canary as a public beta. Some issues may already be fixed in the canary version, so please verify that your issue reproduces. If the issue is resolved on the canary version, this issue can be closed.'
        )
      }
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
