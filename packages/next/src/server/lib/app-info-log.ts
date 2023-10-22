import { loadEnvConfig } from '@next/env'
import * as Log from '../../build/output/log'
import { bold, linearGradient, purple } from '../../lib/picocolors'
import { PHASE_DEVELOPMENT_SERVER } from '../../shared/lib/constants'
import loadConfig, { getEnabledExperimentalFeatures } from '../config'

export function logStartInfo({
  networkUrl,
  appUrl,
  envInfo,
  expFeatureInfo,
  formatDurationText,
  maxExperimentalFeatures,
}: {
  networkUrl: string | null
  appUrl: string | null
  envInfo?: string[]
  expFeatureInfo?: string[]
  formatDurationText: string | null
  maxExperimentalFeatures?: number
}) {
  const colorFormat = process.env.TURBOPACK
    ? (text: string) => linearGradient(text, [0, 0, 255], [255, 0, 0])
    : purple
  Log.bootstrap(
    bold(
      colorFormat(
        `${Log.prefixes.ready} Next.js ${process.env.__NEXT_VERSION}${
          process.env.TURBOPACK ? ' (turbo)' : ''
        }`
      )
    )
  )
  if (appUrl) {
    Log.bootstrap(`- Local:        ${appUrl}`)
  }
  if (networkUrl) {
    Log.bootstrap(`- Network:      ${networkUrl}`)
  }
  if (envInfo?.length) Log.bootstrap(`- Environments: ${envInfo.join(', ')}`)

  if (expFeatureInfo?.length) {
    Log.bootstrap(`- Experiments (use at your own risk):`)
    // only show maximum 3 flags
    for (const exp of expFeatureInfo.slice(0, maxExperimentalFeatures)) {
      Log.bootstrap(`   · ${exp}`)
    }
    /* ${expFeatureInfo.length - 3} more */
    if (expFeatureInfo.length > 3 && maxExperimentalFeatures) {
      Log.bootstrap(`   · ...`)
    }
  }

  // New line after the bootstrap info
  Log.info('')
  if (formatDurationText) {
    Log.event(`Ready in ${formatDurationText}`)
  }
}

export async function getStartServerInfo(dir: string): Promise<{
  envInfo?: string[]
  expFeatureInfo?: string[]
}> {
  let expFeatureInfo: string[] = []
  await loadConfig(PHASE_DEVELOPMENT_SERVER, dir, {
    onLoadUserConfig(userConfig) {
      const userNextConfigExperimental = getEnabledExperimentalFeatures(
        userConfig.experimental
      )
      expFeatureInfo = userNextConfigExperimental.sort(
        (a, b) => a.length - b.length
      )
    },
  })

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
    expFeatureInfo,
  }
}
