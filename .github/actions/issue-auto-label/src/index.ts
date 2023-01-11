import * as github from '@actions/github'
import * as core from '@actions/core'

const LABELS = {
  LINEAR: 'linear',
  KIND_BUG: 'kind: bug',
}

async function run() {
  try {
    const { payload, repo } = github.context
    const {
      issue,
      pull_request,
      label: { name: newLabel },
    } = payload

    if (pull_request || !issue?.body || !process.env.GITHUB_TOKEN) return

    const client = github.getOctokit(process.env.GITHUB_TOKEN).rest
    const issueCommon = { ...repo, issue_number: issue.number }

    if (newLabel === LABELS.KIND_BUG) {
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
