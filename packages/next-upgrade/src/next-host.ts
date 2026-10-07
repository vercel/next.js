import { createRequire } from 'module'
import { dirname, join } from 'path'
import { interopDefault } from './utils/project'

// Next.js phases, as defined in `next/constants`.
export const PHASE_INFO = 'phase-info'
export const PHASE_PRODUCTION_BUILD = 'phase-production-build'

// The parts of a Next.js config this package reads.
export type UpgradeNextConfig = {
  distDir?: string
  cacheComponents?: boolean
  experimental?: {
    agentUpgrade?: 'security' | 'latest' | 'experimental-future' | false
  }
}

// The parts of Next.js' Telemetry this package uses.
export type UpgradeTelemetry = {
  readonly isEnabled: boolean
  record(
    event:
      | { eventName: string; payload: object }
      | Array<{ eventName: string; payload: object }>
  ): Promise<unknown>
  flush(): Promise<unknown>
  flushDetached(options: {
    mode: 'dev'
    dir: string
    distDir: string
    events: Array<{ eventName: string; payload: object }>
  }): unknown
}

// This package never imports `next` itself: an upgrade must work for apps on
// any Next.js version, and `next` depends on this package. Config and
// telemetry come from the Next.js installed in the app instead, through paths
// that are stable across the releases this package supports.
function requireFromNext(directory: string, request: string): any {
  const requireFromApp = createRequire(join(directory, 'package.json'))
  const nextDirectory = dirname(requireFromApp.resolve('next/package.json'))
  return createRequire(join(nextDirectory, 'package.json'))(request)
}

export async function loadNextConfig(
  directory: string,
  phase: typeof PHASE_INFO | typeof PHASE_PRODUCTION_BUILD,
  options: { silent?: boolean; rawConfig?: boolean; resetEnv?: boolean }
): Promise<UpgradeNextConfig> {
  const loadConfig = interopDefault(
    requireFromNext(directory, 'next/dist/server/config')
  )
  try {
    const config = await loadConfig(phase, directory, {
      silent: options.silent,
      rawConfig: options.rawConfig,
    })
    if (!options.rawConfig) {
      return config
    }
    // Normalize the raw config without validating legacy options against the
    // current Next.js schema.
    const { normalizeConfig } = requireFromNext(
      directory,
      'next/dist/server/config-shared'
    )
    return normalizeConfig(phase, interopDefault(config))
  } finally {
    // Loading the config loads the app's .env files into process.env through
    // the app's copy of @next/env. Callers that must not see them undo it.
    if (options.resetEnv) {
      try {
        requireFromNext(directory, '@next/env').resetEnv()
      } catch {}
    }
  }
}

export function createNextTelemetry(
  directory: string,
  distDir: string
): UpgradeTelemetry {
  let Telemetry
  try {
    ;({ Telemetry } = requireFromNext(directory, 'next/dist/telemetry/storage'))
  } catch {
    // Without an installed Next.js there is no telemetry consent to honor.
    return {
      isEnabled: false,
      record: async () => {},
      flush: async () => {},
      flushDetached() {},
    }
  }
  return new Telemetry({ distDir, skipNotify: true })
}
