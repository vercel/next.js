/**
 * This action will comment on issues that have incorrect/missing/outdated reproductions.
 */

// @ts-check
import { context, getOctokit } from '@actions/github'
import { setFailed, info, debug } from '@actions/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const verifyCanaryLabel = 'please verify canary'
const addReproductionLabel = 'please add a complete reproduction'
const addMimimalReproductionLabel = 'please simplify reproduction'
const __dirname = `${process.env.GITHUB_WORKSPACE}/.github/actions/issue-validator/clarify`

const labelActions = {
  [addReproductionLabel]: {
    file: 'repro.md',
    comment:
      'Commented on issue, because it did not have a sufficient reproduction.',
  },
  [addMimimalReproductionLabel]: {
    file: 'simplify-repro.md',
    comment: 'Commented on issue, because it had a complex reproduction.',
  },
  [verifyCanaryLabel]: {
    file: 'canary.md',
    comment: 'Commented on issue, because it was not verified against canary.',
  },
}

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
 *
 * @typedef {{
 *  pull_request: any
 *  issue?: {body: string, number: number, labels: Label[]}
 *  label: Label
 * }} Payload
 *
 * @typedef {{
 *  payload: Payload
 *  repo: any
 * }} Context
 */

async function run() {
  const { payload, repo } = context
  const {
    issue,
    pull_request,
    label: { name: newLabel },
  } = payload

  if (pull_request || !issue?.body || !process.env.GITHUB_TOKEN) return

  /** @type {string[]} */
  const labels = issue.labels.map((l) => l.name)

  const labelActionKeys = Object.keys(labelActions)
  if (
    !labelActionKeys.includes(newLabel) &&
    !labels.some((label) => labelActionKeys.includes(label))
  ) {
    return info('Not manually labeled or already labeled.')
  }

  const client = getOctokit(process.env.GITHUB_TOKEN).rest
  const issueCommon = { ...repo, issue_number: issue.number }

  const { file, comment } = labelActions[newLabel]

  await client.issues.addLabels({ ...issueCommon, labels: [newLabel] })

  const body = readFileSync(join(__dirname, file), 'utf8')
  await client.issues.createComment({ ...issueCommon, body })

  info(comment)
}

run().catch(setFailed)
