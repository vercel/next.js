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
;(async () => {
  const args = [...process.argv]
  const eventsFile = args.pop()
  let dir = args.pop()
  const mode = args.pop()

  if (!dir || mode !== 'dev') {
    throw new Error(
      `Invalid flags should be run as node detached-flush dev ./path-to/project [eventsFile]`
    )
  }
  dir = getProjectDir(dir)

  const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, dir)
  const distDir = path.join(dir, config.distDir || '.next')
  // Support both old format (no eventsFile arg) and new format (with eventsFile arg)
  const eventsPath = path.join(
    distDir,
    eventsFile && !eventsFile.includes('/') ? eventsFile : '_events.json'
  )

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
