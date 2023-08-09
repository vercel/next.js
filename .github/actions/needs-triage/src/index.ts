import * as github from '@actions/github'
import * as core from '@actions/core'

const LABELS = {
  VERIFY_CANARY: 'please verify canary',
  ADD_REPRODUCTION: 'please add a complete reproduction',
  SIMPLIFY_REPRODUCTION: 'please simplify reproduction',
  NEEDS_TRIAGE: 'type: needs triage',
}

const labelsRequireUserInput = [
  LABELS.VERIFY_CANARY,
  LABELS.ADD_REPRODUCTION,
  LABELS.SIMPLIFY_REPRODUCTION,
]

function assertNotNullable<T>(value: T): asserts value is NonNullable<T> {
  if (value === undefined || value === null)
    throw new Error('Unexpected nullable value')
}

async function run() {
  try {
    const { payload, repo } = github.context
    const { issue, comment } = payload

    assertNotNullable(issue)
    assertNotNullable(comment)

    if (!process.env.GITHUB_TOKEN) return

    const client = github.getOctokit(process.env.GITHUB_TOKEN).rest
    const issueCommon = { ...repo, issue_number: issue.number }

    const issueLabels: string[] = issue.labels.map((label: any) => label.name)

    if (labelsRequireUserInput.some((label) => issueLabels.includes(label))) {
      if (comment.user.type !== 'Bot') {
        client.issues.addLabels({
          ...issueCommon,
          labels: [LABELS.NEEDS_TRIAGE],
        })
      }
    }
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

run()
