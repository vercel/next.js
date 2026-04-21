import { getInput, info, setFailed, warning } from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { minimatch } from 'minimatch'
import config from './config.json'

type AuthorRule = { type: 'user'; pattern: string }
type LabelRule = string | AuthorRule
type LabelerConfig = { labels: Record<string, LabelRule[]> }

function isAuthorRule(rule: LabelRule): rule is AuthorRule {
  return (
    typeof rule === 'object' &&
    rule !== null &&
    'type' in rule &&
    rule.type === 'user'
  )
}

/**
 * Compute the set of labels to apply for a pull request.
 */
export function computeLabels(
  config: LabelerConfig,
  author: string,
  changedFiles: string[]
): string[] {
  const matched = new Set<string>()

  for (const [label, rules] of Object.entries(config.labels)) {
    for (const rule of rules) {
      if (isAuthorRule(rule)) {
        if (rule.pattern.toLowerCase() === author.toLowerCase()) {
          matched.add(label)
          break
        }
      } else if (typeof rule === 'string') {
        const matches = changedFiles.some((file) =>
          minimatch(file, rule, { dot: true, matchBase: false })
        )
        if (matches) {
          matched.add(label)
          break
        }
      } else {
        warning(
          `Unknown rule type for label "${label}": ${JSON.stringify(rule)}`
        )
      }
    }
  }

  return Array.from(matched)
}

async function main() {
  const token = getInput('github-token') || process.env.GITHUB_TOKEN
  if (!token) {
    throw new TypeError(
      '`github-token` input is missing and GITHUB_TOKEN is not set.'
    )
  }

  const pr = context.payload.pull_request
  if (!pr) {
    info('No pull_request payload present; skipping.')
    return
  }

  const { owner, repo } = context.repo
  const prNumber: number = pr.number
  const author: string | undefined = pr.user?.login
  if (!author) {
    warning('Pull request has no author login; skipping.')
    return
  }

  const octokit = getOctokit(token)

  const changedFiles: string[] = await octokit.paginate(
    octokit.rest.pulls.listFiles,
    { owner, repo, pull_number: prNumber, per_page: 100 },
    (response) => response.data.map((f) => f.filename)
  )

  info(`PR #${prNumber} author: ${author}`)
  info(`PR #${prNumber} changed files: ${changedFiles.length}`)

  const labelsToAdd = computeLabels(config as LabelerConfig, author, changedFiles)

  if (labelsToAdd.length === 0) {
    info('No labels matched.')
    return
  }

  info(`Applying labels: ${labelsToAdd.join(', ')}`)

  try {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels: labelsToAdd,
    })
  } catch (error) {
    setFailed(
      `Failed to apply labels to PR #${prNumber}: ${
        error instanceof Error ? error.stack ?? error.message : String(error)
      }`
    )
  }
}

main().catch((error) => {
  setFailed(
    error instanceof Error ? error.stack ?? error.message : String(error)
  )
})
