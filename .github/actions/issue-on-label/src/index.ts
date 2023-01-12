import * as github from '@actions/github'
import * as core from '@actions/core'

const LABELS = {
  LINEAR: 'linear',
  KIND_BUG: 'kind: bug',
  NEEDS_INVESTIGAGION: 'type: needs investigation',
}

const labelsPortedToLinear = [LABELS.KIND_BUG, LABELS.NEEDS_INVESTIGAGION]

async function run() {
  try {
    const { payload, repo } = github.context
    const {
      issue,
      label: { name: newLabel },
    } = payload

    if (!issue || !process.env.GITHUB_TOKEN) return

    const client = github.getOctokit(process.env.GITHUB_TOKEN).rest
    const issueCommon = { ...repo, issue_number: issue.number }

    if (labelsPortedToLinear.includes(newLabel)) {
      client.issues.addLabels({
        ...issueCommon,
        labels: [LABELS.LINEAR],
      })
    }
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

run()
