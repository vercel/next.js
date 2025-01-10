import { loadEnvConfig } from '@next/env'
import * as Log from '../../build/output/log'
import { bold, purple } from '../../lib/picocolors'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from '../../shared/lib/constants'
import loadConfig, {
  getConfiguredExperimentalFeatures,
  type ConfiguredExperimentalFeature,
} from '../config'

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
  Log.bootstrap(
    `${bold(
      purple(`${Log.prefixes.ready} Next.js ${process.env.__NEXT_VERSION}`)
    )}${process.env.TURBOPACK ? ' (Turbopack)' : ''}`
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
        exp.type === 'boolean'
          ? exp.value === true
            ? bold('✓')
            : bold('⨯')
          : '·'

      const suffix = exp.type === 'number' ? `: ${exp.value}` : ''

      Log.bootstrap(`  ${symbol} ${exp.name}${suffix}`)
    }
    /* indicate if there are more than the maximum shown no. flags */
    if (experimentalFeatures.length > maxExperimentalFeatures) {
      Log.bootstrap(`  · ...`)
    }
  }

  // New line after the bootstrap info
  Log.info('')
}

export async function getStartServerInfo(
  dir: string,
  dev: boolean
): Promise<{
  envInfo?: string[]
  experimentalFeatures?: ConfiguredExperimentalFeature[]
}> {
  let experimentalFeatures: ConfiguredExperimentalFeature[] = []
  await loadConfig(
    dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_BUILD,
    dir,
    {
      onLoadUserConfig(userConfig) {
        const configuredExperimentalFeatures =
          getConfiguredExperimentalFeatures(userConfig.experimental)

        experimentalFeatures = configuredExperimentalFeatures.sort(
          ({ name: a }, { name: b }) => a.length - b.length
        )
      },
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
