import fs from 'fs'
import path from 'path'
import type { TelemetryEvent } from './storage'
import { Telemetry } from './storage'
import loadConfig from '../server/config'
import { getProjectDir } from '../lib/get-project-dir'
import { PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'

// this process should be started with following arg order
// 1. mode e.g. dev, export, start
// 2. project dir
// 3. events filename (optional, defaults to _events.json)
// 4. resolved dist directory (optional, avoids reloading phase-specific config)
;(async () => {
  const [mode, inputDir, eventsFile, suppliedDistDir] = process.argv.slice(2)
  let dir = inputDir

  if (!dir || mode !== 'dev') {
    throw new Error(
      `Invalid flags should be run as node detached-flush dev ./path-to/project [eventsFile] [distDir]`
    )
  }
  dir = getProjectDir(dir)

  // Build nudges pass their resolved output directory to avoid loading dev config again.
  const distDir = suppliedDistDir
    ? path.resolve(suppliedDistDir)
    : path.join(
        dir,
        (await loadConfig(PHASE_DEVELOPMENT_SERVER, dir)).distDir || '.next'
      )

  // Named batches live in cache so build cleanup cannot remove them before submission.
  // Retain the legacy root path for callers without an events filename.
  const eventsPath =
    eventsFile && !eventsFile.includes('/')
      ? path.join(distDir, 'cache', eventsFile)
      : path.join(distDir, '_events.json')

  let events: TelemetryEvent[]
  try {
    events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'))
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // no events to process we can exit now
      process.exit(0)
    }
    throw err
  }

  const telemetry = new Telemetry({ distDir })
  await telemetry.record(events)
  await telemetry.flush()

  // finished flushing events clean-up
  fs.unlinkSync(eventsPath)
  // Don't call process.exit() here - let Node.js exit naturally after
  // all pending work completes (e.g., setTimeout in debug telemetry)
})()
