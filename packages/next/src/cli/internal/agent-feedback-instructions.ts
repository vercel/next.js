import { readFile } from 'fs/promises'
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from 'fs'
import path from 'path'
import { processEnv, type LoadedEnvFiles } from '@next/env'
import { isAgentFeedbackEnabled } from './agent-feedback-status'
import { isCI } from '../../server/ci-info'
import { Telemetry } from '../../telemetry/storage'

const AGENT_FEEDBACK_PROTOCOL_PATH = path.join(
  __dirname,
  '../../agent-feedback/protocol.md'
)
const MAX_DOTENV_FILE_SIZE = 1024 * 1024

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
    const envFiles = readAgentFeedbackEnvFiles(dir)
    if (envFiles === null) return false

    // Use Node's native environment so dotenv retains case-insensitive keys on
    // Windows. Restore it synchronously before any remote gate request.
    let parseFailed = false
    const [env] = processEnv(
      envFiles,
      dir,
      {
        info() {},
        error() {
          parseFailed = true
        },
      },
      true
    )
    return !parseFailed && !env.NEXT_TELEMETRY_DISABLED
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!Object.prototype.hasOwnProperty.call(originalEnv, key)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  }
}

function readAgentFeedbackEnvFiles(dir: string): LoadedEnvFiles | null {
  const mode = process.env.NODE_ENV === 'test' ? 'test' : 'development'
  const names = [
    `.env.${mode}.local`,
    ...(mode === 'test' ? [] : ['.env.local']),
    `.env.${mode}`,
    '.env',
  ]
  const files: LoadedEnvFiles = []

  try {
    for (const name of names) {
      const file = path.join(dir, name)
      // The general dotenv loader follows symlinks and accepts named pipes.
      // This read-only CLI must not follow a link to a network share or block
      // on a special file before deciding whether feedback is allowed.
      const stats = lstatSync(file, { throwIfNoEntry: false })
      if (!stats) continue
      if (!stats.isFile() || stats.size > MAX_DOTENV_FILE_SIZE) return null

      const fd = openSync(
        file,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      )
      try {
        const openedStats = fstatSync(fd)
        if (
          !openedStats.isFile() ||
          openedStats.dev !== stats.dev ||
          openedStats.ino !== stats.ino ||
          openedStats.size > MAX_DOTENV_FILE_SIZE
        ) {
          return null
        }

        // Read at most one byte beyond the limit, even if the file grows.
        const buffer = Buffer.alloc(MAX_DOTENV_FILE_SIZE + 1)
        let bytes = 0
        while (bytes < buffer.length) {
          const count = readSync(fd, buffer, bytes, buffer.length - bytes, null)
          if (count === 0) break
          bytes += count
        }
        if (bytes > MAX_DOTENV_FILE_SIZE) return null
        files.push({
          path: name,
          contents: buffer.toString('utf8', 0, bytes),
          env: {},
        })
      } finally {
        closeSync(fd)
      }
    }
    return files
  } catch {
    // An unreadable or unsafe dotenv file cannot establish permission to send
    // a request. Leave feedback disabled instead of following another path.
    return null
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
