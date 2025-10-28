import { loadEnvConfig } from '@next/env'
import * as Log from '../../build/output/log'
import { bold, purple, strikethrough } from '../../lib/picocolors'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from '../../shared/lib/constants'
import loadConfig, { type ConfiguredExperimentalFeature } from '../config'
import { experimentalSchema } from '../config-schema'

export function logStartInfo({
  networkUrl,
  appUrl,
  envInfo,
  experimentalFeatures,
  logBundler,
  cacheComponents,
}: {
  networkUrl: string | null
  appUrl: string | null
  envInfo?: string[]
  experimentalFeatures?: ConfiguredExperimentalFeature[]
  logBundler: boolean
  cacheComponents?: boolean
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

  if (cacheComponents) {
    parts.push('Cache Components')
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
    Log.bootstrap(`- Local:        ${appUrl}`)
  }
  if (networkUrl) {
    Log.bootstrap(`- Network:      ${networkUrl}`)
  }
  if (envInfo?.length) Log.bootstrap(`- Environments: ${envInfo.join(', ')}`)

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

export async function getStartServerInfo({
  dir,
  dev,
  debugPrerender,
}: {
  dir: string
  dev: boolean
  debugPrerender?: boolean
}): Promise<{
  envInfo?: string[]
  experimentalFeatures?: ConfiguredExperimentalFeature[]
  cacheComponents?: boolean
}> {
  let experimentalFeatures: ConfiguredExperimentalFeature[] = []
  let cacheComponents = false
  const config = await loadConfig(
    dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_BUILD,
    dir,
    {
      reportExperimentalFeatures(features) {
        experimentalFeatures = features.sort(({ key: a }, { key: b }) =>
          a.localeCompare(b)
        )
      },
      debugPrerender,
      silent: false,
    }
  )

  cacheComponents = !!config.cacheComponents

  // we need to reset env if we are going to create
  // the worker process with the esm loader so that the
  // initial env state is correct
  let envInfo: string[] = []
  const { loadedEnvFiles } = loadEnvConfig(dir, true, console, false)
  if (loadedEnvFiles.length > 0) {
    envInfo = loadedEnvFiles.map((f) => f.path)
  }

  return {
    envInfo,
    experimentalFeatures,
    cacheComponents,
  }
}
