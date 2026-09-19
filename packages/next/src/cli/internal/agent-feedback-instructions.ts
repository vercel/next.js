import { readFile } from 'fs/promises'
import path from 'path'
import { isAgentFeedbackEnabled } from './agent-feedback-status'

const AGENT_FEEDBACK_PROTOCOL_PATH = path.join(
  __dirname,
  '../../agent-feedback/protocol.md'
)

type IsEnabled = () => Promise<boolean>
type ReadProtocol = () => Promise<string>

export interface AgentFeedbackInstructionsOptions {
  dryRun?: boolean
}

const DRY_RUN_INSTRUCTIONS = `# Dry run

Use the protocol below to prepare each qualifying report and encode its review URL, but do not open a browser tab. Print each review URL for inspection instead. Do not clear retained candidates or mark the feedback pass complete.

`

export async function loadAgentFeedbackInstructions(
  options: AgentFeedbackInstructionsOptions = {},
  isEnabled: IsEnabled = isAgentFeedbackEnabled,
  readProtocol: ReadProtocol = () =>
    readFile(AGENT_FEEDBACK_PROTOCOL_PATH, 'utf8')
): Promise<string | null> {
  try {
    if (!options.dryRun && !(await isEnabled())) {
      return null
    }

    const protocol = await readProtocol()
    return options.dryRun ? `${DRY_RUN_INSTRUCTIONS}${protocol}` : protocol
  } catch {
    return null
  }
}

export async function agentFeedbackInstructionsCli(
  options: AgentFeedbackInstructionsOptions = {}
): Promise<void> {
  const instructions = await loadAgentFeedbackInstructions(options)
  if (instructions) {
    process.stdout.write(instructions)
  }
}
