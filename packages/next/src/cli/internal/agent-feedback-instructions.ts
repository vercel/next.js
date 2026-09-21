import { readFile } from 'fs/promises'
import path from 'path'
import { isAgentFeedbackEnabled } from './agent-feedback-status'

const AGENT_FEEDBACK_PROTOCOL_PATH = path.join(
  __dirname,
  '../../agent-feedback/protocol.md'
)

type IsEnabled = () => Promise<boolean>
type ReadProtocol = () => Promise<string>
type LoadInstructions = () => Promise<string | null>

export async function loadAgentFeedbackInstructions(
  isEnabled: IsEnabled = isAgentFeedbackEnabled,
  readProtocol: ReadProtocol = () =>
    readFile(AGENT_FEEDBACK_PROTOCOL_PATH, 'utf8')
): Promise<string | null> {
  if (!(await isEnabled())) {
    return null
  }

  try {
    return await readProtocol()
  } catch {
    return null
  }
}

export async function agentFeedbackInstructionsCli(
  loadInstructions: LoadInstructions = loadAgentFeedbackInstructions
): Promise<void> {
  try {
    const instructions = await loadInstructions()
    if (instructions) {
      process.stdout.write(instructions)
    }
  } catch {
    process.stderr.write(
      'Unable to check whether Next.js agent feedback is enabled. Rerun this command with network access.\n'
    )
    process.exitCode = 1
  }
}
