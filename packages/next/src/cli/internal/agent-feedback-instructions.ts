import { readFile } from 'fs/promises'
import path from 'path'
import { isAgentFeedbackEnabled } from './agent-feedback-status'

const AGENT_FEEDBACK_PROTOCOL_PATH = path.join(
  __dirname,
  '../../agent-feedback/protocol.md'
)

type IsEnabled = () => Promise<boolean>
type ReadProtocol = () => Promise<string>

export async function loadAgentFeedbackInstructions(
  isEnabled: IsEnabled = isAgentFeedbackEnabled,
  readProtocol: ReadProtocol = () =>
    readFile(AGENT_FEEDBACK_PROTOCOL_PATH, 'utf8')
): Promise<string | null> {
  try {
    if (!(await isEnabled())) {
      return null
    }

    return await readProtocol()
  } catch {
    return null
  }
}

export async function agentFeedbackInstructionsCli(): Promise<void> {
  const instructions = await loadAgentFeedbackInstructions()
  if (instructions) {
    process.stdout.write(instructions)
  }
}
