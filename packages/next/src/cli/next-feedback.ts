import type { ChildProcess, SpawnOptions } from 'child_process'

import spawn from 'next/dist/compiled/cross-spawn'

const AGENT_FEEDBACK_REVIEW_URL = 'https://nextjs.org/agent-feedback#report='

type SpawnReviewForm = (
  command: string,
  args: string[],
  options: SpawnOptions
) => ChildProcess

export type NextFeedbackOptions = {
  dryRun?: boolean
}

export function agentFeedbackReviewUrl(encodedReport: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(encodedReport)) {
    throw new Error('The report must be unpadded base64url.')
  }

  let report: unknown
  try {
    const decoded = Buffer.from(encodedReport, 'base64url')
    if (decoded.toString('base64url') !== encodedReport) {
      throw new Error('non-canonical base64url')
    }
    report = JSON.parse(decoded.toString('utf8'))
  } catch {
    throw new Error('The report must contain base64url-encoded JSON.')
  }

  if (
    typeof report !== 'object' ||
    report === null ||
    !('schemaVersion' in report) ||
    report.schemaVersion !== 5
  ) {
    throw new Error('The report must use agent feedback schema version 5.')
  }

  return `${AGENT_FEEDBACK_REVIEW_URL}${encodedReport}`
}

function reviewFormCommand(url: string, platform: NodeJS.Platform) {
  if (platform === 'darwin') return { command: 'open', args: [url] }
  if (platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'start', '""', `"${url}"`],
      windowsVerbatimArguments: true,
    }
  }
  return { command: 'xdg-open', args: [url] }
}

export function openAgentFeedbackReviewForm(
  url: string,
  platform: NodeJS.Platform = process.platform,
  spawnReviewForm: SpawnReviewForm = spawn
): Promise<void> {
  const { command, args, windowsVerbatimArguments } = reviewFormCommand(
    url,
    platform
  )
  const child = spawnReviewForm(command, args, {
    detached: true,
    stdio: 'ignore',
    ...(windowsVerbatimArguments && { windowsVerbatimArguments }),
  })

  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export async function nextFeedback(
  encodedReport: string,
  options: NextFeedbackOptions = {},
  openReviewForm: (url: string) => Promise<void> = openAgentFeedbackReviewForm
): Promise<void> {
  let url: string
  try {
    url = agentFeedbackReviewUrl(encodedReport)
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Invalid agent feedback report.'}\n`
    )
    process.exitCode = 1
    return
  }

  process.stdout.write(`${url}\n`)
  if (options.dryRun) return

  try {
    await openReviewForm(url)
  } catch {
    process.stderr.write(
      'Unable to open the agent feedback review form. Use the URL printed above.\n'
    )
  }
}
