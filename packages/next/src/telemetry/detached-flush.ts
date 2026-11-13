import fs from 'fs'
import path from 'path'
import type { TelemetryEvent } from './storage'
import { Telemetry } from './storage'
import { getProjectDir } from '../lib/get-project-dir'

// A detached process has no parent left to clean it up if work never settles.
// Leave normal exit (including draining debug output) to Node, but bound its lifetime.
setTimeout(() => process.exit(0), 10 * 60 * 1000).unref()

// this process should be started with following arg order
// 1. mode e.g. dev, export, start
// 2. project dir
// 3. events filename
// 4. resolved dist directory
;(async () => {
  const [mode, inputDir, eventsFile, suppliedDistDir] = process.argv.slice(2)

  if (!inputDir || mode !== 'dev' || !eventsFile || !suppliedDistDir) {
    throw new Error(
      `Invalid flags should be run as node detached-flush dev <projectDir> <eventsFile> <distDir>`
    )
  }
  getProjectDir(inputDir)

  const distDir = path.resolve(suppliedDistDir)
  const eventsPath = path.join(distDir, 'cache', eventsFile)

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
