#!/usr/bin/env node
/**
 * Next.js CPU Profile Script
 *
 * Generates CPU profiles for Next.js startup and dev server boot.
 *
 * Usage:
 *   node scripts/profile-next-dev-boot.js [options]
 *
 * Options:
 *   --test-dir=PATH     Test project directory (default: /private/tmp/next-boot-test)
 *   --output-dir=PATH   Output directory for profiles (default: ./profiles)
 *   --turbopack         Use Turbopack (default)
 *   --webpack           Use Webpack
 *   --duration=MS       How long to profile after ready (default: 1000)
 *   --cli               Profile just the CLI entry point (runs next --help)
 *
 * Output files:
 *   - dev-turbopack-YYYY-MM-DDTHH-MM-SS.cpuprofile
 *   - cli-turbopack-YYYY-MM-DDTHH-MM-SS.cpuprofile
 *
 * The profile can be loaded in:
 *   - Chrome DevTools (Performance tab -> Load profile)
 *   - VS Code (JavaScript Profile Visualizer extension)
 *   - https://www.speedscope.app/
 *
 * Note: Currently profiles the parent process only. For child process profiling,
 * additional Next.js changes are needed (see future PRs).
 */

const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// Parse arguments
const args = process.argv.slice(2)
const getArg = (name, defaultValue) => {
  const arg = args.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.split('=')[1] : defaultValue
}
const hasFlag = (name) => args.includes(`--${name}`)

const testDir = getArg('test-dir', '/private/tmp/next-boot-test')
const baseOutputDir =
  getArg('output-dir', null) || path.join(process.cwd(), 'profiles')
const useWebpack = hasFlag('webpack')
const duration = parseInt(getArg('duration', '1000'), 10)
const profileCli = hasFlag('cli')
const bundlerFlag = useWebpack ? '--webpack' : '--turbopack'

// Generate meaningful profile names
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const bundlerName = useWebpack ? 'webpack' : 'turbopack'
const profileType = profileCli ? 'cli' : 'dev'
const outputDir = baseOutputDir
const profileName = `${profileType}-${bundlerName}-${timestamp}`

const nextDir = path.join(__dirname, '..', 'packages', 'next')
const nextBin = path.join(nextDir, 'dist/bin/next')

if (profileCli) {
  console.log('\x1b[34m=== Next.js CLI Entry Point Profile ===\x1b[0m')
} else {
  console.log('\x1b[34m=== Next.js Dev Server CPU Profile ===\x1b[0m')
  console.log(`Test directory: ${testDir}`)
  console.log(`Bundler: ${useWebpack ? 'Webpack' : 'Turbopack'}`)
}
console.log(`Output directory: ${outputDir}`)
console.log('')

// Verify test directory (only for dev server profiling)
if (!profileCli && !fs.existsSync(testDir)) {
  console.error(
    `\x1b[31mError: Test directory does not exist: ${testDir}\x1b[0m`
  )
  process.exit(1)
}

// Create output directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

// Kill existing processes
function killNextDev() {
  try {
    execSync('pkill -f "next dev"', { stdio: 'ignore' })
  } catch {}
}

async function runProfile() {
  killNextDev()
  await new Promise((r) => setTimeout(r, 500))

  // Clean .next directory
  const nextCache = path.join(testDir, '.next')
  if (fs.existsSync(nextCache)) {
    fs.rmSync(nextCache, { recursive: true, force: true })
  }

  console.log('Starting dev server with CPU profiling...')
  console.log('(Profile will be saved after server is ready)')
  console.log('')

  return new Promise((resolve, reject) => {
    let resolved = false

    // Profile the parent process with --cpu-prof
    const spawnArgs = [
      process.execPath,
      [
        '--cpu-prof',
        `--cpu-prof-dir=${outputDir}`,
        `--cpu-prof-name=${profileName}`,
        nextBin,
        'dev',
        bundlerFlag,
      ],
    ]

    const child = spawn(spawnArgs[0], spawnArgs[1], {
      cwd: testDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    })

    let output = ''

    const onData = (data) => {
      const text = data.toString()
      output += text
      process.stdout.write(text)

      // Wait for "Ready in Xms"
      if (output.includes('Ready in') && !resolved) {
        resolved = true
        console.log('')
        console.log(
          `\x1b[33mServer ready, profiling for ${duration}ms more...\x1b[0m`
        )

        // Wait a bit then stop
        setTimeout(() => {
          console.log('Stopping server and saving profile...')
          child.kill('SIGINT')
        }, duration)
      }
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    child.on('close', (code) => {
      killNextDev()

      // Wait a moment for profile files to be written
      setTimeout(() => {
        // Find and rename profiles matching our name pattern
        // --cpu-prof-name creates files without extension
        const files = fs.readdirSync(outputDir)
        const rawFiles = files.filter(
          (f) => f.startsWith(profileName) && !f.endsWith('.cpuprofile')
        )

        // Rename raw files to have .cpuprofile extension
        rawFiles.forEach((f) => {
          const oldPath = path.join(outputDir, f)
          const newPath = path.join(outputDir, `${f}.cpuprofile`)
          fs.renameSync(oldPath, newPath)
        })

        // Now find all .cpuprofile files
        const profileFiles = fs
          .readdirSync(outputDir)
          .filter((f) => f.startsWith(profileName) && f.endsWith('.cpuprofile'))
        const profiles = profileFiles
          .map((f) => ({
            name: f,
            path: path.join(outputDir, f),
            size: fs.statSync(path.join(outputDir, f)).size,
          }))
          .filter((p) => p.size > 0)
          .sort((a, b) => b.size - a.size)

        if (profiles.length > 0) {
          console.log('')
          console.log(`\x1b[32mProfile(s) saved:\x1b[0m`)
          profiles.forEach((p, i) => {
            const sizeKB = Math.round(p.size / 1024)
            console.log(`  ${i + 1}. ${p.path} (${sizeKB} KB)`)
          })
          console.log('')
          console.log('To view the profile:')
          console.log('  1. Open Chrome DevTools -> Performance tab')
          console.log('  2. Click "Load profile" and select the file')
          console.log('  3. Or use https://www.speedscope.app/')
          console.log('')
          console.log(
            '\x1b[33mTip:\x1b[0m The largest profile is usually the child process (server worker)'
          )
          resolve(profiles[0].path)
        } else {
          console.log('')
          console.log(
            '\x1b[33mNo profiles found. Trying alternative method...\x1b[0m'
          )
          console.log('')
          console.log(
            'To profile the child process, modify next-dev.ts to add profiling flags.'
          )
          console.log(
            'Or use: node --cpu-prof --cpu-prof-dir=./profiles ./dist/bin/next dev'
          )
          reject(new Error('Profile file not found'))
        }
      }, 500)
    })

    child.on('error', reject)

    // Timeout
    setTimeout(() => {
      if (!resolved) {
        child.kill('SIGKILL')
        reject(new Error('Timeout waiting for server'))
      }
    }, 120000)
  })
}

async function runCliProfile() {
  console.log('Profiling CLI entry point (next --help)...')
  console.log('')

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--cpu-prof',
        `--cpu-prof-dir=${outputDir}`,
        `--cpu-prof-name=${profileName}`,
        nextBin,
        '--help',
      ],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0' },
      }
    )

    child.stdout.on('data', () => {})
    child.stderr.on('data', () => {})

    child.on('close', (code) => {
      // Wait for profile to be written
      setTimeout(() => {
        // --cpu-prof-name creates files without extension, rename to .cpuprofile
        const rawFile = path.join(outputDir, profileName)
        const finalFile = path.join(outputDir, `${profileName}.cpuprofile`)

        if (fs.existsSync(rawFile)) {
          fs.renameSync(rawFile, finalFile)
          const size = fs.statSync(finalFile).size
          console.log(`\x1b[32mProfile saved:\x1b[0m`)
          console.log(`  ${finalFile} (${Math.round(size / 1024)} KB)`)
          console.log('')
          console.log('To view the profile:')
          console.log('  1. Open Chrome DevTools -> Performance tab')
          console.log('  2. Click "Load profile" and select the file')
          console.log('  3. Or use https://www.speedscope.app/')
          console.log('')
          console.log(
            '\x1b[33mTip:\x1b[0m Look for heavy modules loaded at startup'
          )
          resolve(finalFile)
        } else if (fs.existsSync(finalFile)) {
          const size = fs.statSync(finalFile).size
          console.log(`\x1b[32mProfile saved:\x1b[0m`)
          console.log(`  ${finalFile} (${Math.round(size / 1024)} KB)`)
          resolve(finalFile)
        } else {
          reject(new Error('Profile file not found'))
        }
      }, 500)
    })

    child.on('error', reject)
  })
}

// Main execution
const main = profileCli ? runCliProfile : runProfile

main().catch((err) => {
  console.error('\x1b[31mError:\x1b[0m', err.message)
  if (!profileCli) killNextDev()
  process.exit(1)
})
