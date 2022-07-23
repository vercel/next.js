// @ts-check
import * as github from '@actions/github'
import * as core from '@actions/core'

const verifyCanaryLabel = 'please verify canary'
const bugReportLabel = 'template: bug'
const addReproductionLabel = 'please add a complete reproduction'
const debug = !!process.env.DEBUG
const json = (o) => JSON.stringify(o, null, 2)

/**
 * @typedef {{
 *  id :number
 *  node_id :string
 *  url :string
 *  name :string
 *  description :string
 *  color :string
 *  default :boolean
 * }} Label
 */

async function run() {
  try {
    const { payload, repo } = github.context
    const { issue, pull_request } = payload

    if (pull_request || !issue?.body) return

    /** @type {Label} */
    const newLabel = payload.label
    const { body, number: issueNumber } = issue
    /** @type {Label[]} */
    const labels = issue.labels

    core.info(
      `Validating issue ${issueNumber}:
  Labels:
    New: ${json(newLabel)}
    All: ${json(labels)}
  Body: ${body}`
    )

    const isBugReport = newLabel.name === bugReportLabel

    const isManuallyLabeled = labels.some(
      (label) => label.name === verifyCanaryLabel
    )

    if (!isBugReport && !isManuallyLabeled) {
      return core.info(
        'Issue is ignored, because it is not a bug report or is not manually labeled'
      )
    }

    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN is not set')
    }

    const client = github.getOctokit(process.env.GITHUB_TOKEN).rest

    /**
     * @param {string} label
     * @param {string} comment
     */
    function notifyOnIssue(label, comment) {
      const issueCommon = { ...repo, issue_number: issueNumber }

      if (debug) {
        core.info('Skipping comment/label because we are in DEBUG mode')
        core.info(json({ label, comment }))
        return
      }

      return Promise.all([
        client.issues.addLabels({ ...issueCommon, labels: [label] }),
        client.issues.createComment({ ...issueCommon, body: comment }),
      ])
    }

    const isVerifyCanaryChecked = body.includes(
      '- [X] I verified that the issue exists in Next.js canary release'
    )

    if (!isVerifyCanaryChecked || isManuallyLabeled) {
      await notifyOnIssue(
        verifyCanaryLabel,
        'Please verify your issue reproduces with `next@canary`. The canary version of Next.js ships daily and includes all features and fixes that have not been released to the stable version yet. Think of canary as a public beta. Some issues may already be fixed in the canary version, so please verify that your issue reproduces by running `npm install next@canary`. If the issue does not reproduce with the canary version, then it has already been fixed and this issue can be closed.'
      )
      return core.info(
        `Commented on issue, because it was ${
          isManuallyLabeled ? 'manually labeled' : 'not verified against canary'
        }`
      )
    }

    const reproductionUrl = body
      .match(/### Link to reproduction\n\n(?<url>.*)\n/)
      ?.groups?.url.trim()

    if (!reproductionUrl || !(await fetch(reproductionUrl)).ok) {
      await notifyOnIssue(
        addReproductionLabel,
        'The link to the reproduction appears to be incorrect/unreachable. Please add a link to the reproduction of the issue. This is a required field. If your project is private, you can invite @balazsorban44 to the repository so the Next.js team can investigate further.'
      )
      return core.info(
        `Commented on issue, because the reproduction url (${reproductionUrl}) was not reachable`
      )
    }

    const containsNextInfoOutput = [
      'Operating System:',
      'Binaries:',
      'Relevant packages:',
    ].every((i) => body.includes(i))

    if (!containsNextInfoOutput) {
      return core.info(
        'Could not detect `next info` output, skipping as version detection might be unreliable'
      )
    }

    const reportedNextVersion = body.match(
      /Relevant packages:\n      next: (?<version>\d+\.\d+\.\d+)/
    )?.groups?.version

    core.info(`Reported Next.js version: ${reportedNextVersion}`)

    if (!reportedNextVersion) {
      // REVIEW: Should we add a label here?
      return
    }

    const { tag_name: lastVersion } = await (
      await client.repos.listReleases(repo)
    ).data[0]

    core.info(`Last Next.js version, based on GitHub releases: ${lastVersion}`)

    if (lastVersion.includes('canary') && reportedNextVersion !== lastVersion) {
      await notifyOnIssue(
        verifyCanaryLabel,
        `The reported Next.js version did not match the latest \`next@canary\` version (${lastVersion}). The canary version of Next.js ships daily and includes all features and fixes that have not been released to the stable version yet. Think of canary as a public beta. Some issues may already be fixed in the canary version, so please verify that your issue reproduces by running \`npm install next@canary\`. If the issue does not reproduce with the canary version, then it has already been fixed and this issue can be closed.`
      )
      return core.info(
        `Commented on issue, because it was not verified against canary`
      )
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
