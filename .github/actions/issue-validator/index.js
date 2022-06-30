// @ts-check
import * as github from '@actions/github'
import * as core from '@actions/core'

const verifyCanaryLabel = 'please verify canary'
const bugReportLabel = 'template: bug'
const addReproductionLabel = 'please add a complete reproduction'

async function run() {
  try {
    const {
      payload: { issue, pull_request },
      repo,
    } = github.context

    if (pull_request || !issue?.body) return

    const { body, labels, number: issueNumber } = issue

    const isManuallyLabeled = labels.some(
      (label) => label.name === verifyCanaryLabel
    )

    const isBugReport = labels.some((label) => label.name === bugReportLabel)

    if (!process.env.GITHUB_TOKEN) {
      return core.setFailed('GITHUB_TOKEN is not set')
    }

    // @ts-ignore
    const client = github.getOctokit(process.env.GITHUB_TOKEN).rest

    /**
     * @param {string} label
     * @param {string} comment
     */
    function notifyOnIssue(label, comment) {
      const issueCommon = { ...repo, issue_number: issueNumber }

      return Promise.all([
        client.issues.addLabels({ ...issueCommon, labels: [label] }),
        client.issues.createComment({ ...issueCommon, body: comment }),
      ])
    }

    const isVerifyCanaryChecked = body.includes(
      '- [X] I verified that the issue exists in Next.js canary release'
    )

    if (
      !isVerifyCanaryChecked || // This can happen if the issue was from a comment in another issue or discussion.
      isManuallyLabeled
    ) {
      return await notifyOnIssue(
        verifyCanaryLabel,
        'Please verify your issue reproduces with `next@canary`. The canary version of Next.js ships daily and includes all features and fixes that have not been released to the stable version yet. Think of canary as a public beta. Some issues may already be fixed in the canary version, so please verify that your issue reproduces by running `npm install next@canary`. If the issue does not reproduce with the canary version, then it has already been fixed and this issue can be closed.'
      )
    }

    if (!isBugReport) return

    const reproductionUrl = body
      .match(/### Link to reproduction\n\n(?<url>.*)\n/)
      ?.groups?.url.trim()

    if (!reproductionUrl || !(await (await fetch(reproductionUrl)).ok)) {
      return await notifyOnIssue(
        addReproductionLabel,
        'The link to the reproduction appears to be incorrect/unreachable. Please add a link to the reproduction of the issue. This is a required field.'
      )
    }

    const reportedNextVersion = body.match(
      /Relevant packages:\n      next: (?<version>\d+\.\d+\.\d+)/
    )?.groups?.version

    if (!reportedNextVersion) {
      // REVIEW: Should we add a label here?
      return
    }

    const { tag_name: lastVersion } = await (
      await client.repos.listReleases(repo)
    ).data[0]

    if (lastVersion.includes('canary') && reportedNextVersion !== lastVersion) {
      return await notifyOnIssue(
        verifyCanaryLabel,
        `The reported Next.js version did not match the latest \`next@canary\` version (${lastVersion}). The canary version of Next.js ships daily and includes all features and fixes that have not been released to the stable version yet. Think of canary as a public beta. Some issues may already be fixed in the canary version, so please verify that your issue reproduces by running \`npm install next@canary\`. If the issue does not reproduce with the canary version, then it has already been fixed and this issue can be closed.`
      )
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
