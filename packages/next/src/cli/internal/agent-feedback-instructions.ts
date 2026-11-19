import { readFile } from 'fs/promises'
import path from 'path'
import { loadEnvConfig } from '@next/env'
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

  const dir = process.cwd()
  // Resolve saved preferences before project dotenv settings can change their
  // storage location (for example, through XDG_CONFIG_HOME).
  if (
    !new Telemetry({
      distDir: path.join(dir, '.next'),
      skipNotify: true,
    }).isEnabled
  ) {
    return false
  }

  const originalEnv = { ...process.env }
  try {
    // Use Node's native environment so dotenv retains case-insensitive keys on
    // Windows. Restore it synchronously before any remote gate request.
    return !loadEnvConfig(dir, true).combinedEnv.NEXT_TELEMETRY_DISABLED
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!Object.prototype.hasOwnProperty.call(originalEnv, key)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  }
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
