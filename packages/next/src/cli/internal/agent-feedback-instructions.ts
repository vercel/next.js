import { readFile } from 'fs/promises'
import path from 'path'
import { isAgentFeedbackEnabled } from './agent-feedback-status'
import { isCI } from '../../server/ci-info'
import { Telemetry } from '../../telemetry/storage'

const AGENT_FEEDBACK_PROTOCOL_PATH = path.join(
  __dirname,
  '../../agent-feedback/protocol.md'
)

type IsEnabled = () => Promise<boolean>
type IsLocallyEnabled = () => boolean
type ReadProtocol = () => Promise<string>
export interface AgentFeedbackInstructionsOptions {
  dryRun?: boolean
}

type LoadInstructions = (
  options?: AgentFeedbackInstructionsOptions
) => Promise<string | null>

const DRY_RUN_INSTRUCTIONS = `# Dry run

Use the protocol below to prepare each qualifying report draft and encode its review URL, but do not open a browser tab. Print each review URL for inspection instead. Do not clear the feedback candidate queue or mark the reporting pass complete.

`

export async function loadAgentFeedbackInstructions(
  options: AgentFeedbackInstructionsOptions = {},
  isEnabled: IsEnabled = isAgentFeedbackEnabled,
  readProtocol: ReadProtocol = () =>
    readFile(AGENT_FEEDBACK_PROTOCOL_PATH, 'utf8'),
  isLocallyEnabled: IsLocallyEnabled = isAgentFeedbackLocallyEnabled
): Promise<string | null> {
  if (!options.dryRun && (!isLocallyEnabled() || !(await isEnabled()))) {
    return null
  }

  try {
    const protocol = await readProtocol()
    return options.dryRun ? `${DRY_RUN_INSTRUCTIONS}${protocol}` : protocol
  } catch {
    return null
  }
}

function isAgentFeedbackLocallyEnabled(): boolean {
  if (isCI) return false

  return new Telemetry({
    distDir: path.join(process.cwd(), '.next'),
    skipNotify: true,
  }).isEnabled
}

export async function agentFeedbackInstructionsCli(
  options: AgentFeedbackInstructionsOptions = {},
  loadInstructions: LoadInstructions = loadAgentFeedbackInstructions
): Promise<void> {
  try {
    const instructions = await loadInstructions(options)
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
