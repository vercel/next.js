const privateCpuProfileName = process.env.__NEXT_PRIVATE_CPU_PROFILE
const isCpuProfileEnabled = process.env.NEXT_CPU_PROF || privateCpuProfileName
const cpuProfileDir = process.env.NEXT_CPU_PROF_DIR

let session: import('inspector').Session | null = null
let profileSaved = false

if (isCpuProfileEnabled) {
  const { Session } = require('inspector') as typeof import('inspector')

  session = new Session()
  session.connect()

  session.post('Profiler.enable')
  session.post('Profiler.start')

  process.on('exit', () => {
    saveCpuProfile()
  })

  // Next.js workers (see `lib/worker.ts`) are stopped with a signal, which
  // terminates the process without emitting 'exit'. Save the profile first,
  // then re-raise the signal so the worker still dies by it and the parent
  // observes the same exit as without profiling.
  if (process.env.IS_NEXT_WORKER) {
    const onSignal = (signal: NodeJS.Signals) => {
      process.removeListener('SIGINT', onSignal)
      process.removeListener('SIGTERM', onSignal)
      saveCpuProfile()
      process.kill(process.pid, signal)
    }
    process.on('SIGINT', onSignal)
    process.on('SIGTERM', onSignal)
  }
}

/**
 * Save the CPU profile to disk.
 *
 * This is synchronous despite the callback-based API because inspector's
 * session.post() executes its callback synchronously when connected to
 * the same process (via session.connect()).
 */
export function saveCpuProfile(): void {
  if (!session || profileSaved || !isCpuProfileEnabled) {
    return
  }
  profileSaved = true

  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')

  session!.post('Profiler.stop', (error, param) => {
    if (error) {
      console.error('Cannot generate CPU profiling:', error)
      return
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19)
    const baseName = privateCpuProfileName || 'cpu-profile'
    // Include the pid so concurrent processes (e.g. build workers) that save
    // within the same second don't overwrite each other's profiles.
    const filename = `${baseName}-${timestamp}-${process.pid}.cpuprofile`

    let outputPath: string
    if (cpuProfileDir) {
      // The CLI created `cpuProfileDir` (with its `.gitignore`) before setting
      // NEXT_CPU_PROF_DIR, so it already exists in these build workers.
      outputPath = path.join(cpuProfileDir, filename)
    } else {
      outputPath = `./${filename}`
    }

    fs.writeFileSync(outputPath, JSON.stringify(param.profile))
    const { green } =
      require('../../lib/picocolors') as typeof import('../../lib/picocolors')
    console.log(`\n${green('CPU profile saved:')} ${outputPath}`)
    console.log('Open in Chrome DevTools → Performance tab → Load profile')
  })
}
