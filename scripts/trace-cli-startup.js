#!/usr/bin/env node
/**
 * CLI Startup Tracer
 *
 * Uses the V8 Inspector API to trace module loading at CLI startup.
 * This helps identify which modules are being loaded eagerly.
 *
 * Usage:
 *   node scripts/trace-cli-startup.js [--command=dev|build|--help]
 */

const inspector = require('inspector')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const getArg = (name, defaultValue) => {
  const arg = args.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.split('=')[1] : defaultValue
}

const command = getArg('command', '--help')
const outputDir = path.join(process.cwd(), 'profiles')

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

console.log('\x1b[34m=== Next.js CLI Startup Trace ===\x1b[0m')
console.log(`Command: next ${command}`)
console.log(`Output directory: ${outputDir}`)
console.log('')

// Start CPU profiling
const session = new inspector.Session()
session.connect()

// Track module loading via require hook
const Module = require('module')
const originalRequire = Module.prototype.require
const loadedModules = []
const moduleLoadTimes = []

Module.prototype.require = function (id) {
  const start = process.hrtime.bigint()
  const result = originalRequire.apply(this, arguments)
  const end = process.hrtime.bigint()
  const durationMs = Number(end - start) / 1e6

  // Get the resolved path
  let resolvedPath = id
  try {
    resolvedPath = require.resolve(id, { paths: [this.path || process.cwd()] })
  } catch {}

  // Filter to show only Next.js-related modules
  if (resolvedPath.includes('next/dist/') || resolvedPath.includes('@next/')) {
    const shortPath = resolvedPath.includes('next/dist/')
      ? resolvedPath.split('next/dist/')[1]
      : resolvedPath

    if (!loadedModules.includes(shortPath)) {
      loadedModules.push(shortPath)
      moduleLoadTimes.push({ module: shortPath, time: durationMs })
    }
  }

  return result
}

// Save original process.exit and intercept to prevent CLI from exiting mid-profile
const originalExit = process.exit
process.exit = () => {
  // Don't actually exit during profiling - we want to capture the full profile
}

// Start profiling
session.post('Profiler.enable', () => {
  session.post('Profiler.start', () => {
    console.log('Starting CLI with profiling...')
    console.log('')

    const startTime = process.hrtime.bigint()

    // Load the CLI
    try {
      process.argv = [process.argv[0], 'next', command]
      require('../packages/next/dist/bin/next')
    } catch (e) {
      // Expected - CLI might throw
    }

    const endTime = process.hrtime.bigint()
    const totalMs = Number(endTime - startTime) / 1e6

    // Stop profiling and save
    session.post('Profiler.stop', (err, { profile }) => {
      if (err) {
        console.error('Error stopping profiler:', err)
      } else {
        const profilePath = path.join(
          outputDir,
          `cli-startup-${Date.now()}.cpuprofile`
        )
        fs.writeFileSync(profilePath, JSON.stringify(profile))
        console.log(`\x1b[32mProfile saved:\x1b[0m ${profilePath}`)
      }

      // Print results
      console.log('')
      console.log(`\x1b[32mTotal startup time:\x1b[0m ${totalMs.toFixed(2)}ms`)
      console.log('')
      console.log(`\x1b[33mModules loaded (${loadedModules.length}):\x1b[0m`)
      console.log('='.repeat(70))

      // Sort by load time
      moduleLoadTimes.sort((a, b) => b.time - a.time)
      moduleLoadTimes.slice(0, 30).forEach((m, i) => {
        const timeStr =
          m.time > 1
            ? `${m.time.toFixed(1)}ms`
            : `${(m.time * 1000).toFixed(0)}μs`
        console.log(`${String(i + 1).padStart(2)}. ${m.module} (${timeStr})`)
      })

      console.log('')
      console.log(`\x1b[33mAll loaded modules:\x1b[0m`)
      console.log(loadedModules.join('\n'))

      // Restore original require
      Module.prototype.require = originalRequire

      session.disconnect()

      // Exit cleanly now that profiling is complete
      originalExit(0)
    })
  })
})
