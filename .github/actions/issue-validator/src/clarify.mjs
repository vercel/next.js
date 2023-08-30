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

  const labels = issue.labels.map((l) => l.name)

  if (
    ![
      verifyCanaryLabel,
      addReproductionLabel,
      addMimimalReproductionLabel,
    ].includes(newLabel) &&
    !(
      labels.includes(verifyCanaryLabel) ||
      labels.includes(addReproductionLabel) ||
      labels.includes(addReproductionLabel)
    )
  ) {
    return info('Not a bug report or not manually labeled or already labeled.')
  }

  const client = getOctokit(process.env.GITHUB_TOKEN).rest
  const issueCommon = { ...repo, issue_number: issue.number }

  if (newLabel === addReproductionLabel) {
    await Promise.all([
      client.issues.addLabels({
        ...issueCommon,
        labels: [addReproductionLabel],
      }),
      client.issues.createComment({
        ...issueCommon,
        body: readFileSync(join(__dirname, 'repro.md'), 'utf8'),
      }),
    ])
    return info(
      'Commented on issue, because it did not have a sufficient reproduction.'
    )
  }

  if (newLabel === addMimimalReproductionLabel) {
    await Promise.all([
      client.issues.addLabels({
        ...issueCommon,
        labels: [addMimimalReproductionLabel],
      }),
      client.issues.createComment({
        ...issueCommon,
        body: readFileSync(join(__dirname, 'simplify-repro.md'), 'utf8'),
      }),
    ])
    return info('Commented on issue, because it had a complex reproduction.')
  }

  if (newLabel === verifyCanaryLabel) {
    await Promise.all([
      client.issues.addLabels({
        ...issueCommon,
        labels: [verifyCanaryLabel],
      }),
      client.issues.createComment({
        ...issueCommon,
        body: readFileSync(join(__dirname, 'canary.md'), 'utf8'),
      }),
    ])
    return info(
      'Commented on issue, because it was not verified against canary.'
    )
  }
}

run().catch(setFailed)
