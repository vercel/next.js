import fs from 'fs'
import path from 'path'
import type { TelemetryEvent } from './storage'
import { Telemetry } from './storage'
import { loadEnvConfig } from '@next/env'
import { getProjectDir } from '../lib/get-project-dir'

// This process is spawned `detached` with nothing supervising it, so it has to
// terminate on its own under every outcome. Nothing here evaluates the user's
// config, but the telemetry request is unbounded: `submitRecord` always passes
// its own signal, so the 5s `AbortSignal.timeout` fallback in
// `postNextTelemetryPayload` never applies. A request that never settles would
// leave this process running forever, reparented to init. `unref()` stops the
// timer from holding the process open; on the normal path the work finishes in
// ~90ms and it never fires.
//
// Not armed under `NEXT_TELEMETRY_DEBUG`. That mode is spawned with `spawnSync`
// and `detached: false`, so it is supervised and cannot be orphaned, and it is
// the only mode that writes enough to stdio for an exit to truncate it.
const EXIT_TIMEOUT_MS = 10_000
if (!process.env.NEXT_TELEMETRY_DEBUG) {
  setTimeout(() => process.exit(0), EXIT_TIMEOUT_MS).unref()
}

// this process should be started with following arg order
// 1. mode e.g. dev, export, start
// 2. project dir
// 3. events filename
// 4. dist dir (absolute)
;(async () => {
  const [, , mode, dirArg, eventsFile, distDir] = process.argv

  if (!dirArg || mode !== 'dev' || !eventsFile || !distDir) {
    throw new Error(
      `Invariant: detached-flush must be invoked as: node detached-flush dev <projectDir> <eventsFile> <distDir>`
    )
  }
  const dir = getProjectDir(dirArg)

  // `.env` may set `NEXT_TELEMETRY_DISABLED`, and `Telemetry` reads it in its
  // constructor, so the environment has to be loaded before that runs. Nothing
  // else in this process loads it.
  loadEnvConfig(dir, true, { info: () => {}, error: () => {} })

  const eventsPath = path.join(distDir, eventsFile)

  let events: TelemetryEvent[]
  try {
    events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'))
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // no events to process, and nothing holds the event loop open
      return
    }
    throw err
  }

  // Claim the batch up front rather than after the flush. The events are in
  // memory and nothing re-reads the file, so unlinking here costs nothing, and
  // if the watchdog fires mid-request the per-pid `_events_<pid>.json` is not
  // left behind for good with nothing that would ever collect it.
  fs.unlinkSync(eventsPath)

  const telemetry = new Telemetry({ distDir })
  await telemetry.record(events)
  await telemetry.flush()

  // Deliberately no `process.exit()` here: nothing in this process holds the
  // event loop open, so it exits on its own once the pending stdio writes
  // drain. Exiting explicitly would truncate the `NEXT_TELEMETRY_DEBUG` output
  // when it exceeds the pipe buffer.
})()
