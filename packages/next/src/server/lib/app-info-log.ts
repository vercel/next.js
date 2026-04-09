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
 * Returns true when `AGENTS.md` or `CLAUDE.md` at or above `dir`
 * contains the Next.js-managed agent-rules marker. File existence
 * alone isn't enough — we care specifically about whether the Next.js
 * directive is installed, because that's what points AI coding agents
 * at the version-matched bundled docs and demonstrably improves their
 * API accuracy.
 *
 * Walks upward from `dir` to cover the common case where `next dev`
 * is run from a monorepo sub-package (e.g. `apps/web/`) but
 * `AGENTS.md` lives at the monorepo root. Stops at the nearest `.git`
 * boundary so we don't reach past the project and accidentally pick
 * up an unrelated agent file higher in the filesystem; if no `.git`
 * exists, the walk bottoms out at the filesystem root.
 *
 * The only supported way to install the marker is via
 * `npx @next/codemod@canary agents-md`, which upserts the managed
 * block into whichever file already exists (or creates both if
 * neither does).
 */
function hasAgentRulesInstalled(dir: string): boolean {
  let currentDir = path.resolve(dir)

  while (true) {
    const agentsMdContents = tryReadFile(path.join(currentDir, 'AGENTS.md'))
    if (agentsMdContents?.includes(AGENT_RULES_MARKER)) return true

    const claudeMdContents = tryReadFile(path.join(currentDir, 'CLAUDE.md'))
    if (claudeMdContents?.includes(AGENT_RULES_MARKER)) return true

    // Stop at the nearest project boundary. `.git` can be either a
    // directory (normal repo) or a file (worktree / submodule), so
    // `existsSync` covers both.
    if (fs.existsSync(path.join(currentDir, '.git'))) return false

    const parent = path.dirname(currentDir)
    if (parent === currentDir) return false
    currentDir = parent
  }
}

/**
 * The env var an intentional user can set to bypass the dev-side
 * agent-rules hard-exit. Named with `DISABLE` rather than `SKIP` so
 * the word itself carries some behavioral friction — setting this is
 * a deliberate acknowledgement that the dev server is running in a
 * knowingly-degraded state for agent-driven workflows.
 *
 * Not documented in `next dev --help` and not mentioned in any CLI
 * flag. The only place it's surfaced is inside the fatal error
 * message itself, framed as an explicit "strongly discouraged" escape
 * hatch for cases where the user genuinely can't run the codemod
 * (e.g. locked-down CI, air-gapped environments).
 */
const BYPASS_ENV_VAR = 'NEXT_DISABLE_AGENT_RULE_CHECK'

const AGENTS_MD_INSTALL_COMMAND = 'npx @next/codemod@canary agents-md'

/**
 * Print a yellow `⚠` warning at the end of `next build` when an AI
 * coding agent is driving the build and the managed agent-rules block
 * isn't installed. Non-fatal — the build still completes, so CI
 * pipelines aren't broken. Humans never see it.
 *
 * The dev-side gate (`checkAgentRulesForDev` below) is fatal instead
 * of a warning, because warnings attached to a successful process are
 * empirically ignored by AI coding agents — the `Ready` + exit-zero
 * signal dominates their categorization of the command as succeeded.
 * Build is the exception only because failing the build breaks CI for
 * legitimate reasons.
 */
export function warnIfMissingAgentRules(dir: string): void {
  if (detectAgent() === null) return
  if (hasAgentRulesInstalled(dir)) return

  const command = cyan(AGENTS_MD_INSTALL_COMMAND)
  Log.warn(
    `Next.js detected an AI coding agent but the managed agent-rules ` +
      `block is not installed in AGENTS.md or CLAUDE.md. Without the ` +
      `managed block, code written for this project will be based on ` +
      `outdated Next.js API knowledge and is likely to be incorrect. ` +
      `Run ${command} to install it before making further code changes.`
  )
}

/**
 * Check the Next.js agent-rules gate for `next dev`.
 *
 * Returns `null` when the caller should proceed normally: no AI
 * coding agent is driving, OR the managed agent-rules block is
 * already installed in `AGENTS.md`/`CLAUDE.md`, OR the user has
 * explicitly set the `NEXT_DISABLE_AGENT_RULE_CHECK` env-var escape
 * hatch.
 *
 * Returns a fatal error message string when an agent is driving and
 * none of the above apply. The caller should print the message and
 * `process.exit(1)` — warnings attached to a successful process are
 * empirically ignored by agents, so the only reliable way to make
 * them act on this is to prevent the `Ready`/success signal from
 * firing at all.
 *
 * The message is deliberately long and rationale-heavy. Agents
 * processing tool output weigh concrete negative consequences ("will
 * suggest wrong APIs that fail at runtime") far more than abstract
 * ones ("improves accuracy"), so spelling out exactly what goes wrong
 * without the managed block is the single most effective way to
 * discourage them from grabbing the escape hatch. The bypass env var
 * is disclosed, but framed as a last resort with a concrete negative
 * consequence attached ("agents will continue producing broken code
 * that takes more time to fix than the codemod takes to run").
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
