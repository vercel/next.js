// @ts-check
import * as github from '@actions/github'
import * as core from '@actions/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const verifyCanaryLabel = 'please verify canary'
const addReproductionLabel = 'please add a complete reproduction'
const __dirname =
  '/home/runner/work/next.js/next.js/.github/actions/issue-validator'

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

    if (pull_request || !issue?.body || !process.env.GITHUB_TOKEN) return

    /** @type {Label} */
    const newLabel = payload.label
    const { body, number: issueNumber } = issue
    const client = github.getOctokit(process.env.GITHUB_TOKEN).rest
    const issueCommon = { ...repo, issue_number: issueNumber }

    /** @param {string|null|undefined} link */
    async function hasRepro(link) {
      if (!link) return false
      try {
        const url = new URL(link)
        if (['example.com'].includes(url.hostname)) {
          return false
        }
      } catch {
        return false
      }
      const response = await fetch(link)
      return response.ok
    }

    const hasValidRepro = await hasRepro(
      body.match(/will be addressed faster\n\n(.*)\n\n### To Reproduce/i)?.[1]
    )

    if (!hasValidRepro || newLabel.name === addReproductionLabel) {
      await client.issues.createComment({
        ...issueCommon,
        body: readFileSync(join(__dirname, 'repro.md'), 'utf8'),
      })
      return core.info(
        'Commented on issue, because it did not have a sufficient reproduction.'
      )
    }

    const isVerifyCanaryChecked = body.match(
      /- \[x\] I verified that the issue exists in the latest Next.js canary release/i
    )

    if (!isVerifyCanaryChecked || newLabel.name === verifyCanaryLabel) {
      await client.issues.createComment({
        ...issueCommon,
        body: readFileSync(join(__dirname, 'canary.md'), 'utf8'),
      })
      return core.info(
        'Commented on issue, because it was not verified against canary.'
      )
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
