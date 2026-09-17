import { loadEnvConfig } from '@next/env'
import * as inspector from 'inspector'
import * as Log from '../../build/output/log'
import { bold, purple, strikethrough } from '../../lib/picocolors'
import type { ConfiguredExperimentalFeature } from '../config'
import { experimentalSchema, futureSchema } from '../config-schema'
import { getAgentName } from '../../telemetry/agent-name'
import { bundlerName, getBundlerFromEnv } from '../../lib/bundler'
import {
  hasCurrentAgentRules,
  writeAgentFiles,
  type AgentFilesResult,
} from './generate-agent-files'

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
  const versionSuffix = logBundler
    ? ` (${bundlerName(getBundlerFromEnv())})`
    : ''

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
  partialPrefetching,
}: {
  experimentalFeatures?: ConfiguredExperimentalFeature[]
  cacheComponents?: boolean
  partialPrefetching?: boolean
}) {
  if (cacheComponents) {
    Log.bootstrap(`- Cache Components enabled`)
  }

  if (partialPrefetching) {
    Log.bootstrap(`- Partial Prefetching enabled`)
  }

  if (experimentalFeatures?.length) {
    // Features set in `future` are a separate, more stable stage than the ones
    // set in `experimental`, so they get their own block.
    const features = experimentalFeatures.filter(
      (feature) => feature.stage !== 'future'
    )
    const futureFeatures = experimentalFeatures.filter(
      (feature) => feature.stage === 'future'
    )

    if (features.length) {
      Log.bootstrap(`- Experiments (use with caution):`)
      for (const exp of features) {
        logConfiguredFeature(exp, experimentalSchema, 'experimental')
      }
    }

    if (futureFeatures.length) {
      Log.bootstrap(`- Future features:`)
      for (const feature of futureFeatures) {
        logConfiguredFeature(feature, futureSchema, 'future')
      }
    }
  }

  // New line after the bootstrap info
  Log.info('')
}

function logConfiguredFeature(
  feature: ConfiguredExperimentalFeature,
  schema: object,
  stageName: 'experimental' | 'future'
) {
  const isValid = Object.prototype.hasOwnProperty.call(schema, feature.key)

  if (!isValid) {
    Log.bootstrap(
      `  ? ${strikethrough(feature.key)} (invalid ${stageName} key)`
    )
    return
  }

  const symbol =
    typeof feature.value === 'boolean'
      ? feature.value === true
        ? bold('✓')
        : bold('⨯')
      : '·'

  const suffix =
    typeof feature.value === 'number' || typeof feature.value === 'string'
      ? `: ${JSON.stringify(feature.value)}`
      : ''

  const reason = feature.reason ? ` (${feature.reason})` : ''

  Log.bootstrap(`  ${symbol} ${feature.key}${suffix}${reason}`)
}

/**
 * When `next dev` detects an AI coding agent but the managed
 * agent-rules block is missing from AGENTS.md / CLAUDE.md — or an
 * outdated version of it is installed — auto-generate or refresh the
 * files so the agent has access to version-matched docs. Returns the
 * write result when files were touched, or `null` when no action was
 * needed.
 *
 * Callers gate this on `config.agentRules !== false` — opt-out is
 * declarative in next.config, not inside this function.
 */
export async function ensureAgentRulesForDev(
  dir: string
): Promise<AgentFilesResult | null> {
  if ((await getAgentName()) === null) return null
  if (hasCurrentAgentRules(dir)) return null

  return writeAgentFiles(dir)
}

/**
 * Gets environment info for logging. Fast operation that doesn't require config.
 */
export function getEnvInfo(dir: string): string[] {
  const { loadedEnvFiles } = loadEnvConfig(dir, true, console, false)
  return loadedEnvFiles.map((f) => f.path)
}
