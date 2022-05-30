// @ts-ignore JSON
import { version as nextVersion } from 'next/package.json'
import path from 'path'
import { fileExists } from '../../lib/file-exists'
import { NextConfig } from '../../server/config'
import { BABEL_CONFIG_FILES } from '../../shared/lib/constants'

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

export async function eventCrashReport({
  error,
  childProcessDuration,
  compiledSuccessfully,
  dir,
  nextConfig,
}: {
  error: string
  childProcessDuration: number
  compiledSuccessfully: boolean
  dir: string
  nextConfig: NextConfig
}): Promise<NextDevCrashReport> {
  return {
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
}
