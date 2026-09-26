import { spawn } from 'node:child_process'

import { getAgentName } from '../telemetry/agent-name'

export type NextAgentFeedbackOptions = {
  feedback: string
}

export function createAgentFeedbackUrl(
  feedback: string,
  { nextVersion, agent }: { nextVersion?: string; agent?: string } = {}
): string | undefined {
  feedback = feedback.trim()
  if (!feedback || feedback.length > 2000) {
    return
  }

  return `https://nextjs.org/agent-feedback#report=${Buffer.from(
    JSON.stringify({ feedback, nextVersion, agent })
  ).toString('base64url')}`
}

export async function nextAgentFeedback(
  options: NextAgentFeedbackOptions
): Promise<void> {
  const url = createAgentFeedbackUrl(options.feedback, {
    nextVersion: process.env.__NEXT_VERSION,
    agent: (await getAgentName()) ?? undefined,
  })
  if (!url) {
    console.error('Feedback must be between 1 and 2000 characters.')
    process.exitCode = 1
    return
  }

  console.log(`Review and submit the report at:\n${url}`)

  const isWindows = process.platform === 'win32'
  const child = spawn(
    isWindows ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open',
    isWindows ? ['/c', 'start', '', url] : [url],
    { detached: true, stdio: 'ignore', windowsHide: true }
  )
  child.on('error', () => {})
  child.unref()
}
