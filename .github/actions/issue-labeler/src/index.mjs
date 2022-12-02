// @ts-check
import * as github from '@actions/github'
import * as core from '@actions/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const __dirname =
  '/home/runner/work/next.js/next.js/.github/actions/issue-labeler'

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
  try {
    /** @type {Context} */
    const { payload, repo } = github.context
    const { issue, pull_request } = payload

    if (pull_request || !issue?.body || !process.env.GITHUB_TOKEN) return
    const client = github.getOctokit(process.env.GITHUB_TOKEN).rest
    const config = loadConfig()
    const { body } = issue

    const sep1 =
      'Which area(s) of Next.js are affected? (leave empty if unsure)\n\n'
    const sep2 = '\n\n### Link to reproduction'
    const bodySection = body.substring(
      body.indexOf(sep1) + sep1.length,
      body.indexOf(sep2)
    )

    const labels = Object.entries(config).reduce((acc, [label, match]) => {
      if (bodySection.includes(match)) acc.push(label)
      return acc
    }, /** @type {string[]} */ ([]))

    await client.issues.addLabels({
      ...repo,
      issue_number: issue.number,
      labels,
    })
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()

/** @returns {{[key: string]: string }} */
function loadConfig() {
  try {
    //  Should match the list "Which area(s) of Next.js are affected?" in:
    //  https://github.com/vercel/next.js/blob/canary/.github/ISSUE_TEMPLATE/1.bug_report.yml
    const configPath = join(__dirname, 'labels.json')
    return JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch (error) {
    error.message = `Could not load config: ${error.message}`
    throw error
  }
}
