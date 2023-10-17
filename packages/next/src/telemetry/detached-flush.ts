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
;(async () => {
  const args = [...process.argv]
  let dir = args.pop()
  const mode = args.pop()

  if (!dir || mode !== 'dev') {
    throw new Error(
      `Invalid flags should be run as node detached-flush dev ./path-to/project`
    )
  }
  dir = getProjectDir(dir)

  const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, dir)
  const distDir = path.join(dir, config.distDir || '.next')
  const eventsPath = path.join(distDir, '_events.json')

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

  // finished flushing events clean-up/exit
  fs.unlinkSync(eventsPath)
  process.exit(0)
})()
