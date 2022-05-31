// @ts-ignore JSON
import { version as nextVersion } from 'next/package.json'
import path, { join } from 'path'
import { fileExists } from '../../lib/file-exists'
import loadConfig from '../../server/config'
import {
  BABEL_CONFIG_FILES,
  PHASE_DEVELOPMENT_SERVER,
} from '../../shared/lib/constants'
import { Telemetry } from '../storage'

const EVENT_NEXT_DEV_CRASH_REPORT = 'NEXT_DEV_CRASH_REPORT'
type NextDevCrashReport = {
  eventName: string
  payload: {
    error: string
    nextVersion: string
    nodeVersion: string
    childProcessDuration: number
    hasWebpackConfig: boolean
    hasBabelConfig: boolean
    compiledSuccessfully: boolean
  }
}

export async function hasBabelConfig(dir: string) {
  const foundFiles = await Promise.all(
    BABEL_CONFIG_FILES.map((file) => fileExists(path.join(dir, file)))
  )
  return foundFiles.some((hasFile) => hasFile)
}

export async function recordCrashReport({
  error,
  dir,
  compiledSuccessfully,
  childProcessDuration,
}: {
  error: string
  dir: string
  compiledSuccessfully: boolean
  childProcessDuration: number
}) {
  try {
    const nextConfig = await loadConfig(PHASE_DEVELOPMENT_SERVER, dir)

    const event: NextDevCrashReport = {
      eventName: EVENT_NEXT_DEV_CRASH_REPORT,
      payload: {
        error,
        nextVersion,
        nodeVersion: process.versions.node,
        childProcessDuration,
        hasBabelConfig: await hasBabelConfig(dir).catch(() => false),
        hasWebpackConfig: typeof nextConfig?.webpack === 'function',
        compiledSuccessfully,
      },
    }

    const distDir = join(dir, nextConfig.distDir)
    const telemetry = new Telemetry({ distDir })
    telemetry.record(event)
  } catch {}
}
