import type { ChildProcess, SpawnOptions } from 'child_process'

import spawn from 'next/dist/compiled/cross-spawn'
import { z } from 'next/dist/compiled/zod'

const AGENT_FEEDBACK_REVIEW_URL = 'https://nextjs.org/agent-feedback#report='
const MAX_AGENT_FEEDBACK_INPUT_BYTES = 16 * 1024
const AGENT_FEEDBACK_INPUT_TIMEOUT_MS = 5_000

type SpawnReviewForm = (
  command: string,
  args: string[],
  options: SpawnOptions
) => ChildProcess

type FeedbackInput = NodeJS.ReadableStream & {
  isTTY?: boolean
}

export type NextFeedbackOptions = {
  dryRun?: boolean
}

const agentFeedbackReportSchema = z
  .object({
    schemaVersion: z.literal(5),
    triggerReason: z.enum([
      'unexpected-behavior',
      'documentation-mismatch',
      'misleading-error',
      'repeated-failed-approach',
      'non-obvious-workaround',
    ]),
    title: z.string().min(1).max(100),
    setup: z
      .object({
        mode: z.enum([
          'development',
          'production-build',
          'production-server',
          'test',
        ]),
        bundler: z.enum(['turbopack', 'webpack', 'unknown']),
        relevantFeatures: z.array(z.string().min(1).max(32)).max(3).optional(),
      })
      .strict(),
    steps: z.array(z.string().min(1).max(240)).min(1).max(4),
    observed: z.array(z.string().min(1).max(160)).min(1).max(3),
    expected: z.string().min(1).max(200),
    comparison: z.string().min(1).max(180).optional(),
    frequency: z.enum(['once', 'reproduced']),
    outcome: z.enum(['blocked', 'worked-around', 'resolved']),
    nextVersion: z.string().min(1).max(64),
    agent: z.string().min(1).max(64),
  })
  .strict()

async function readFeedbackInput(input: FeedbackInput): Promise<string> {
  return new Promise((resolve, reject) => {
    let report = ''
    let inputBytes = 0

    const timeout = setTimeout(() => {
      finish(() => {
        input.pause()
        reject(
          new Error(
            'Timed out waiting for the agent feedback report on standard input.'
          )
        )
      })
    }, AGENT_FEEDBACK_INPUT_TIMEOUT_MS)

    function cleanup() {
      clearTimeout(timeout)
      input.removeListener('data', onData)
      input.removeListener('end', onEnd)
      input.removeListener('error', onError)
    }

    let settled = false
    function finish(callback: () => void) {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    function onData(chunk: string) {
      inputBytes += Buffer.byteLength(chunk)
      if (inputBytes > MAX_AGENT_FEEDBACK_INPUT_BYTES) {
        finish(() => {
          input.pause()
          reject(
            new Error(
              `The agent feedback report must not exceed ${MAX_AGENT_FEEDBACK_INPUT_BYTES} bytes.`
            )
          )
        })
        return
      }

      report += chunk
    }

    function onEnd() {
      finish(() => resolve(report.trim()))
    }

    function onError(error: Error) {
      finish(() => reject(error))
    }

    input.setEncoding('utf8')
    input.on('data', onData)
    input.once('end', onEnd)
    input.once('error', onError)
  })
}

export async function resolveAgentFeedbackReport(
  encodedReport: string | undefined,
  input: FeedbackInput = process.stdin
): Promise<string> {
  if (encodedReport !== undefined) return encodedReport

  if (input.isTTY) {
    throw new Error(
      'Provide an agent feedback report as an argument or pipe it through standard input.'
    )
  }

  const report = await readFeedbackInput(input)
  if (!report) {
    throw new Error(
      'No agent feedback report was provided through standard input.'
    )
  }

  return report
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

  if (!agentFeedbackReportSchema.safeParse(report).success) {
    throw new Error('The report must match agent feedback schema version 5.')
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
  encodedReport: string | undefined,
  options: NextFeedbackOptions = {},
  openReviewForm: (url: string) => Promise<void> = openAgentFeedbackReviewForm,
  input: FeedbackInput = process.stdin
): Promise<void> {
  let url: string
  try {
    const report = await resolveAgentFeedbackReport(encodedReport, input)
    url = agentFeedbackReviewUrl(report)
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
