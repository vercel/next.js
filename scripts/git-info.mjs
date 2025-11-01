// @ts-check
import fs from 'fs/promises'
import { promisify } from 'util'
import { exec as execOrig } from 'child_process'

const exec = promisify(execOrig)

/**
 * Gets git repository information from the environment
 * @returns {Promise<{branchName: string, remoteUrl: string, commitSha: string, isCanary: boolean}>}
 */
export async function getGitInfo() {
  let eventData = {}

  try {
    eventData =
      JSON.parse(
        await fs.readFile(process.env.GITHUB_EVENT_PATH || '', 'utf8')
      )['pull_request'] || {}
  } catch (_) {}

  const branchName =
    eventData?.head?.ref ||
    process.env.GITHUB_REF_NAME ||
    (await exec('git rev-parse --abbrev-ref HEAD')).stdout.trim()

  const remoteUrl =
    eventData?.head?.repo?.full_name ||
    process.env.GITHUB_REPOSITORY ||
    (await exec('git remote get-url origin')).stdout.trim()

  const commitSha =
    eventData?.head?.sha ||
    process.env.GITHUB_SHA ||
    (await exec('git rev-parse HEAD')).stdout.trim()

  const isCanary =
    branchName === 'canary' && remoteUrl.includes('vercel/next.js')

  return { branchName, remoteUrl, commitSha, isCanary }
}

/**
 * Determines the appropriate git diff revision based on the environment
 * @returns {Promise<string>} The git revision to diff against
 */
export async function getDiffRevision() {
  if (
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.GITHUB_EVENT_NAME === 'pull_request'
  ) {
    // GH Actions for `pull_request` run on the merge commit so HEAD~1:
    // 1. includes all changes in the PR
    //    e.g. in
    //    A-B-C-main - F
    //     \          /
    //      D-E-branch
    //    GH actions for `branch` runs on F, so a diff for HEAD~1 includes the diff of D and E combined
    // 2. Includes all changes of the commit for pushes
    return 'HEAD~1'
  } else {
    try {
      await exec('git remote set-branches --add origin canary')
      await exec('git fetch origin canary --depth=20')
    } catch (err) {
      const remoteInfo = await exec('git remote -v')
      console.error(remoteInfo.stdout)
      console.error(remoteInfo.stderr)
      console.error(`Failed to fetch origin/canary`, err)
    }
    // TODO: We should diff against the merge base with origin/canary not directly against origin/canary.
    // A --- B ---- origin/canary
    //  \
    //   \-- C ---- HEAD
    // `git diff origin/canary` includes B and C
    // But we should only include C.
    return 'origin/canary'
  }
}
