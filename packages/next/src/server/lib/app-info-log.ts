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
 * packages/create-next-app/helpers/generate-agent-files.ts.
 */
const AGENT_RULES_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'

/**
 * Returns true when `AGENTS.md` or `CLAUDE.md` in `dir` contains the
 * Next.js-managed agent-rules marker. The marker is what tells AI coding
 * agents to read the version-matched bundled docs instead of relying on
 * stale training data.
 */
function hasAgentRulesInstalled(dir: string): boolean {
  const agentsMdContents = tryReadFile(path.join(dir, 'AGENTS.md'))
  const claudeMdContents = tryReadFile(path.join(dir, 'CLAUDE.md'))
  return Boolean(
    agentsMdContents?.includes(AGENT_RULES_MARKER) ||
      claudeMdContents?.includes(AGENT_RULES_MARKER)
  )
}

function baseAgentRulesMessage(): string {
  const command = cyan('npx @next/codemod@latest agents-md')
  return `Next.js agent rules not installed. Run ${command} so AI coding agents read the bundled docs instead of stale training data.`
}

/**
 * Emit a warning at the end of `next build` when the agent rules are missing
 * and an AI coding agent is driving the build. Never fails the build — CI
 * pipelines should keep working. Humans never see this.
 */
export function warnIfMissingAgentRules(dir: string): void {
  if (detectAgent() === null) {
    return
  }
  if (hasAgentRulesInstalled(dir)) {
    return
  }
  Log.warn(baseAgentRulesMessage())
}

/**
 * Returns an error message when `next dev` should be blocked because the
 * Next.js agent rules aren't installed, or `null` when the caller should
 * proceed as normal. Gated on `detectAgent()` so humans never trip it. The
 * `--skip-agent-rule-check` CLI flag bypasses the check entirely (for edge
 * cases like an `AI_AGENT` env var leaking into a human shell).
 *
 * Unlike the build-side warning, this path exits the dev server so agents
 * can't accidentally develop against a project that isn't scaffolded with
 * the bundled-docs instructions.
 */
export function getAgentRulesDevError(
  dir: string,
  { skip }: { skip: boolean }
): string | null {
  if (skip) return null
  if (detectAgent() === null) return null
  if (hasAgentRulesInstalled(dir)) return null
  const escape = cyan('--skip-agent-rule-check')
  return `${baseAgentRulesMessage()} Pass ${escape} to \`next dev\` to bypass this check.`
}

function tryReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Gets environment info for logging. Fast operation that doesn't require config.
 */
export function getEnvInfo(dir: string): string[] {
  const { loadedEnvFiles } = loadEnvConfig(dir, true, console, false)
  return loadedEnvFiles.map((f) => f.path)
}
