import { loadEnvConfig } from '@next/env'
import fs from 'fs'
import * as inspector from 'inspector'
import path from 'path'
import * as Log from '../../build/output/log'
import { bold, cyan, purple, strikethrough } from '../../lib/picocolors'
import type { ConfiguredExperimentalFeature } from '../config'
import { experimentalSchema } from '../config-schema'
import { detectAgent } from '../../telemetry/detect-agent'

// Re-export the type for consumers
export type { ConfiguredExperimentalFeature }

/**
 * Logs basic startup info that doesn't require config.
 * Called before "Ready in X" to show immediate feedback.
 */
export function logStartInfo({
  networkUrl,
  appUrl,
  envInfo,
  logBundler,
}: {
  networkUrl: string | null
  appUrl: string | null
  envInfo?: string[]
  logBundler: boolean
}) {
  let versionSuffix = ''
  const parts = []

  if (logBundler) {
    if (process.env.TURBOPACK) {
      parts.push('Turbopack')
    } else if (process.env.NEXT_RSPACK) {
      parts.push('Rspack')
    } else {
      parts.push('webpack')
    }
  }

  if (parts.length > 0) {
    versionSuffix = ` (${parts.join(', ')})`
  }

  Log.bootstrap(
    `${bold(
      purple(`${Log.prefixes.ready} Next.js ${process.env.__NEXT_VERSION}`)
    )}${versionSuffix}`
  )
  if (appUrl) {
    Log.bootstrap(`- Local:         ${appUrl}`)
  }
  if (networkUrl) {
    Log.bootstrap(`- Network:       ${networkUrl}`)
  }
  const inspectorUrl = inspector.url()
  if (inspectorUrl) {
    // Could also parse this port from the inspector URL.
    // process.debugPort will always be defined even if the process is not being inspected.
    // The full URL seems noisy as far as I can tell.
    // Node.js will print the full URL anyway.
    const debugPort = process.debugPort
    Log.bootstrap(`- Debugger port: ${debugPort}`)
  }
  if (envInfo?.length) Log.bootstrap(`- Environments: ${envInfo.join(', ')}`)
}

/**
 * Logs experimental features and config-dependent info.
 * Called after getRequestHandlers completes.
 */
export function logExperimentalInfo({
  experimentalFeatures,
  cacheComponents,
}: {
  experimentalFeatures?: ConfiguredExperimentalFeature[]
  cacheComponents?: boolean
}) {
  if (cacheComponents) {
    Log.bootstrap(`- Cache Components enabled`)
  }

  if (experimentalFeatures?.length) {
    Log.bootstrap(`- Experiments (use with caution):`)
    for (const exp of experimentalFeatures) {
      const isValid = Object.prototype.hasOwnProperty.call(
        experimentalSchema,
        exp.key
      )
      if (isValid) {
        const symbol =
          typeof exp.value === 'boolean'
            ? exp.value === true
              ? bold('✓')
              : bold('⨯')
            : '·'

        const suffix =
          typeof exp.value === 'number' || typeof exp.value === 'string'
            ? `: ${JSON.stringify(exp.value)}`
            : ''

        const reason = exp.reason ? ` (${exp.reason})` : ''

        Log.bootstrap(`  ${symbol} ${exp.key}${suffix}${reason}`)
      } else {
        Log.bootstrap(
          `  ? ${strikethrough(exp.key)} (invalid experimental key)`
        )
      }
    }
  }

  // New line after the bootstrap info
  Log.info('')
}

/**
 * Keep in sync with the marker written by `create-next-app` in
 * packages/create-next-app/helpers/generate-agent-files.ts and with the
 * codemod in packages/next-codemod/lib/agents-md.ts.
 */
const AGENT_RULES_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'

function tryReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Returns true when `AGENTS.md` or `CLAUDE.md` at `dir` contains the
 * managed agent-rules marker. `dir` is the Next.js project directory
 * (the package.json level) — the same location `upgrade agents-md`
 * writes to, so check and codemod stay anchored together.
 */
function hasAgentRulesInstalled(dir: string): boolean {
  const agentsMdContents = tryReadFile(path.join(dir, 'AGENTS.md'))
  if (agentsMdContents?.includes(AGENT_RULES_MARKER)) return true

  const claudeMdContents = tryReadFile(path.join(dir, 'CLAUDE.md'))
  if (claudeMdContents?.includes(AGENT_RULES_MARKER)) return true

  return false
}

/**
 * Escape hatch for the agent-rules hard-exit. Disclosed only inside
 * the fatal message itself (not in `--help`) and framed as "strongly
 * discouraged" so agents don't grab it off surface area.
 */
const BYPASS_ENV_VAR = 'NEXT_DISABLE_AGENT_RULE_CHECK'

const AGENTS_MD_INSTALL_COMMAND = 'npx @next/codemod@canary upgrade agents-md'

/**
 * Returns a fatal message string when `next dev` should exit instead
 * of starting — AI coding agent detected, managed block missing, and
 * no bypass env var set. Returns `null` when the caller should
 * proceed. The caller prints and `process.exit(1)`; anything short
 * of a non-zero exit is empirically ignored by agents.
 *
 * Message length is deliberate: concrete negative consequences and a
 * last-resort bypass with stick framing are what actually move agent
 * behavior, validated against live Claude Code.
 */
export function checkAgentRulesForDev(dir: string): string | null {
  if (detectAgent() === null) return null
  if (hasAgentRulesInstalled(dir)) return null
  if (process.env[BYPASS_ENV_VAR]) return null

  const command = cyan(AGENTS_MD_INSTALL_COMMAND)
  const bypass = cyan(`${BYPASS_ENV_VAR}=1`)

  return (
    `Fatal: Dev Server exited. We detected you're running Next.js ` +
    `inside an AI coding agent but the managed agent-rules block is ` +
    `not installed in AGENTS.md or CLAUDE.md.\n\n` +
    `Why this matters: AI coding agents are trained on older Next.js ` +
    `versions and don't know about breaking changes, deprecated APIs, ` +
    `or new features in your installed version. Without the managed ` +
    `block pointing them at the version-matched docs bundled with ` +
    `your install, they will write code using outdated patterns that ` +
    `fail at runtime or are silently incorrect.\n\n` +
    `Run ${command} to install it.\n\n` +
    `As a last-resort escape hatch, setting ${bypass} bypasses this ` +
    `check. Strongly discouraged — agents will still produce broken ` +
    `code, and fixing that will cost far more time than the codemod ` +
    `takes to run.`
  )
}

/**
 * Gets environment info for logging. Fast operation that doesn't require config.
 */
export function getEnvInfo(dir: string): string[] {
  const { loadedEnvFiles } = loadEnvConfig(dir, true, console, false)
  return loadedEnvFiles.map((f) => f.path)
}
