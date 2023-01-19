import { traceGlobals } from '../../trace/shared'
import { Telemetry } from '../storage'
// @ts-ignore JSON
import { version as nextVersion, optionalDependencies } from 'next/package.json'

const EVENT_PLUGIN_PRESENT = 'NEXT_SWC_LOAD_FAILURE'
export type EventSwcLoadFailure = {
  eventName: string
  payload: {
    platform: string
    arch: string
    nodeVersion: string
    nextVersion: string
    wasm?: 'enabled' | 'fallback' | 'failed'
    glibcVersion?: string
    installedSwcPackages?: string
  }
}

export async function eventSwcLoadFailure(
  event?: EventSwcLoadFailure['payload']
): Promise<void> {
  const telemetry: Telemetry | undefined = traceGlobals.get('telemetry')
  // can't continue if telemetry isn't set
  if (!telemetry) return

  let glibcVersion
  let installedSwcPackages

  try {
    // @ts-ignore
    glibcVersion = process.report?.getReport().header.glibcVersionRuntime
  } catch (_) {}

  try {
    const pkgNames = Object.keys(optionalDependencies || {}).filter((pkg) =>
      pkg.startsWith('@next/swc')
    )
    const installedPkgs = []

    for (const pkg of pkgNames) {
      try {
        const { version } = require(`${pkg}/package.json`)
        installedPkgs.push(`${pkg}@${version}`)
      } catch (_) {}
    }

    if (installedPkgs.length > 0) {
      installedSwcPackages = installedPkgs.sort().join(',')
    }
  } catch (_) {}

  telemetry.record({
    eventName: EVENT_PLUGIN_PRESENT,
    payload: {
      nextVersion,
      glibcVersion,
      installedSwcPackages,
      arch: process.arch,
      platform: process.platform,
      nodeVersion: process.versions.node,
      wasm: event?.wasm,
    },
  })
  // ensure this event is flushed before process exits
  await telemetry.flush()
}
