import { loadEnvConfig } from '@next/env'
import * as Log from '../../build/output/log'
import { bold, purple } from '../../lib/picocolors'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from '../../shared/lib/constants'
import loadConfig, { type ConfiguredExperimentalFeature } from '../config'

export function logStartInfo({
  networkUrl,
  appUrl,
  envInfo,
  experimentalFeatures,
  maxExperimentalFeatures = Infinity,
}: {
  networkUrl: string | null
  appUrl: string | null
  envInfo?: string[]
  experimentalFeatures?: ConfiguredExperimentalFeature[]
  maxExperimentalFeatures?: number
}) {
  let bundlerSuffix
  if (process.env.TURBOPACK) {
    bundlerSuffix = ' (Turbopack)'
  } else if (process.env.NEXT_RSPACK) {
    bundlerSuffix = ' (Rspack)'
  } else {
    bundlerSuffix = ''
  }

  Log.bootstrap(
    `${bold(
      purple(`${Log.prefixes.ready} Next.js ${process.env.__NEXT_VERSION}`)
    )}${bundlerSuffix}`
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
    // only show a maximum number of flags
    for (const exp of experimentalFeatures.slice(0, maxExperimentalFeatures)) {
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
    }
    /* indicate if there are more than the maximum shown no. flags */
    if (experimentalFeatures.length > maxExperimentalFeatures) {
      Log.bootstrap(`  · ...`)
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
}> {
  let experimentalFeatures: ConfiguredExperimentalFeature[] = []
  await loadConfig(
    dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_BUILD,
    dir,
    {
      reportExperimentalFeatures(features) {
        experimentalFeatures = features.sort(
          ({ key: a }, { key: b }) => a.length - b.length
        )
      },
      debugPrerender,
    }
  )

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
  }
}
