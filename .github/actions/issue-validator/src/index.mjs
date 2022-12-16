// @ts-check
// @ts-expect-error
import * as github from '@actions/github'
// @ts-expect-error
import * as core from '@actions/core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const verifyCanaryLabel = 'please verify canary'
const addReproductionLabel = 'please add a complete reproduction'
// const bugLabel = 'template: bug'
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
    const {
      issue,
      pull_request,
      label: { name: newLabel },
    } = payload

    if (pull_request || !issue?.body || !process.env.GITHUB_TOKEN) return

    const labels = issue.labels.map((l) => l.name)
    // const isBugReport =
    //   labels.includes(bugLabel) || newLabel === bugLabel || !labels.length

    if (
      // !(isBugReport && issue.number > 43554) &&
      ![verifyCanaryLabel, addReproductionLabel].includes(newLabel) &&
      !(
        labels.includes(verifyCanaryLabel) ||
        labels.includes(addReproductionLabel)
      )
    ) {
      return core.info(
        'Not a bug report or not manually labeled or already labeled.'
      )
    }

    // /** @param {string|null|undefined} link */
    // async function hasRepro(link) {
    //   if (!link) return false
    //   try {
    //     const url = new URL(link)
    //     if (['example.com'].includes(url.hostname)) {
    //       return false
    //     }
    //   } catch {
    //     return false
    //   }
    //   const response = await fetch(link)
    //   return response.ok
    // }

    // const hasValidRepro =
    //   isBugReport &&
    //   (await hasRepro(
    //     issue.body.match(
    //       /will be addressed faster\n\n(.*)\n\n### To Reproduce/i
    //     )?.[1]
    //   ))

    const client = github.getOctokit(process.env.GITHUB_TOKEN).rest
    const issueCommon = { ...repo, issue_number: issue.number }

    if (
      newLabel === addReproductionLabel
      // || !hasValidRepro
    ) {
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
      return core.info(
        'Commented on issue, because it did not have a sufficient reproduction.'
      )
    }

    // const isVerifyCanaryChecked =
    //   isBugReport &&
    //   issue.body.match(
    //     /- \[x\] I verified that the issue exists in the latest Next.js canary release/i
    //   )

    if (
      newLabel === verifyCanaryLabel
      // || !isVerifyCanaryChecked
    ) {
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
      return core.info(
        'Commented on issue, because it was not verified against canary.'
      )
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
