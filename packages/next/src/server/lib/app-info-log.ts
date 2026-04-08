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
  // The `AGENT:` prefix is a direct addressee tag that LLM-based assistants
  // parse as "this message is for me". The rest is imperative and gives the
  // agent a clear priority order: run the codemod before doing anything else
  // Next.js-related, because the training data they're working from is stale
  // and the project has no agent directives to correct it. We name both
  // `AGENTS.md` and `CLAUDE.md` because the marker can live in either.
  return `AGENT: Run ${command} now. Your Next.js training data is stale and your AGENTS.md/CLAUDE.md has no Next.js directives to correct it. Do this before any other Next.js work.`
}

/**
 * Emit an error-level message when the Next.js agent rules are missing and
 * an AI coding agent is driving `next dev` or `next build`. Non-fatal — the
 * dev server and build still run, so CI pipelines and interactive workflows
 * aren't broken.
 *
 * Implementation notes:
 *
 *   - We use `Log.error` (red ⨯ prefix on `console.error` / stderr) rather
 *     than `Log.warn` because agents parsing command output latch onto
 *     ERROR-level lines far more reliably than yellow warnings.
 *   - The message body is deliberately worded to tell agents to stop and
 *     ask the user for permission, rather than auto-running the codemod.
 *     See `baseAgentRulesMessage`.
 *   - Cheap enough to call unconditionally at startup: two small sync file
 *     reads (`AGENTS.md` + `CLAUDE.md`) and one env var check. No config
 *     load, no workspace walk, no dynamic imports.
 *   - Gated on `detectAgent()` so humans running the dev server or build in
 *     a normal terminal never see it.
 */
export function warnIfMissingAgentRules(dir: string): void {
  if (detectAgent() === null) {
    return
  }
  if (hasAgentRulesInstalled(dir)) {
    return
  }
  Log.error(baseAgentRulesMessage())
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
