#!/usr/bin/env node
// Local wrapper for running native docker builds.
//
// Usage: node scripts/docker-native-build.js [flags] [filter]
//   --quick        Use release-with-assertions profile (no LTO, faster)
//   --host-target  Share host target/ dir with container for caching
//   --rebuild      Force Docker image rebuild
//   --test         Smoke-test built binaries (native arch only)
//   filter         Substring match on target name (e.g. "musl", "x86_64")

'use strict'

const { execSync, execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const REPO_ROOT = path.resolve(__dirname, '..')
const DOCKER_IMAGE = 'next-swc-builder:latest'

const TARGETS = [
  {
    target: 'x86_64-unknown-linux-gnu',
    arch: 'x86_64',
    abi: 'gnu',
    napiPlatform: 'linux-x64-gnu',
  },
  {
    target: 'aarch64-unknown-linux-gnu',
    arch: 'aarch64',
    abi: 'gnu',
    napiPlatform: 'linux-arm64-gnu',
  },
  {
    target: 'x86_64-unknown-linux-musl',
    arch: 'x86_64',
    abi: 'musl',
    napiPlatform: 'linux-x64-musl',
  },
  {
    target: 'aarch64-unknown-linux-musl',
    arch: 'aarch64',
    abi: 'musl',
    napiPlatform: 'linux-arm64-musl',
  },
]

// Map uname -m to our arch names
const HOST_ARCH =
  os.arch() === 'arm64' || os.arch() === 'aarch64' ? 'aarch64' : 'x86_64'

// --- Parse args ---
const args = process.argv.slice(2)
let quick = false
let hostTarget = false
let rebuild = false
let test = false
let filter = ''

for (const arg of args) {
  switch (arg) {
    case '--quick':
      quick = true
      break
    case '--host-target':
      hostTarget = true
      break
    case '--rebuild':
      rebuild = true
      break
    case '--test':
      test = true
      break
    case '--help':
    case '-h':
      console.log(
        'Usage: node scripts/docker-native-build.js [--quick] [--host-target] [--rebuild] [--test] [filter]'
      )
      process.exit(0)
    default:
      if (arg.startsWith('--')) {
        console.error(`Unknown flag: ${arg}`)
        process.exit(1)
      }
      filter = arg
  }
}

// --- Filter targets ---
let targets = TARGETS
if (filter) {
  targets = TARGETS.filter((t) => t.target.includes(filter))
}
if (targets.length === 0) {
  console.error(`No targets match filter: "${filter}"`)
  console.error('Available:', TARGETS.map((t) => t.target).join(', '))
  process.exit(1)
}

// --- Build Docker image via turbo task ---
// Step 1: turbo either builds (cache miss) or restores image.tar (cache hit).
// Step 2: --load ensures the image is in docker (turbo skips the script on hit).
function ensureDockerImage() {
  try {
    execSync(`docker image inspect ${DOCKER_IMAGE}`, { stdio: 'ignore' })
    if (!rebuild) return // already loaded
  } catch {
    // not loaded — continue to build/restore
  }

  const forceFlag = rebuild ? ' -- --force' : ''
  execSync(`pnpm -F @next/swc build-docker-image${forceFlag}`, {
    stdio: 'inherit',
    cwd: REPO_ROOT,
  })
  // Load the image if turbo restored it from cache (turbo skips the script on hit)
  const loadFlag = rebuild ? '--force' : '--load'
  execFileSync(
    'node',
    [path.join(__dirname, 'docker-image-cache.js'), loadFlag],
    {
      stdio: 'inherit',
    }
  )
}

ensureDockerImage()

// --- Build targets ---
const buildTask = quick
  ? 'build-native-release-with-assertions'
  : 'build-native-release'

if (quick) {
  console.log(
    'Quick mode: using release-with-assertions profile (no LTO, 64 codegen units)'
  )
}
console.log(
  `Building ${targets.length} target(s): ${targets.map((t) => t.target).join(', ')}\n`
)

const HOME = os.homedir()

for (const { target, arch, abi } of targets) {
  console.log('='.repeat(50))
  console.log(`Building: ${target}`)
  console.log(`Docker:   ${DOCKER_IMAGE}`)
  console.log(`Task:     ${buildTask}`)
  console.log('='.repeat(50))

  // Clean previous build
  const nativeDir = path.join(REPO_ROOT, 'packages/next-swc/native')
  for (const f of fs.readdirSync(nativeDir)) {
    if (f.endsWith('.node')) fs.unlinkSync(path.join(nativeDir, f))
  }

  const volumeArgs = hostTarget ? [] : ['-v', '/build/target']

  const dockerArgs = [
    'run',
    '--rm',
    '-e',
    'CI=1',
    '-e',
    'RUST_BACKTRACE=1',
    '-e',
    'CARGO_TERM_COLOR=always',
    '-e',
    'CARGO_INCREMENTAL=0',
    '-e',
    `TARGET=${target}`,
    '-e',
    `ABI=${abi}`,
    '-e',
    `ARCH=${arch}`,
    '-e',
    `BUILD_TASK=${buildTask}`,
    '-v',
    `${HOME}/.cargo/git:/root/.cargo/git`,
    '-v',
    `${HOME}/.cargo/registry:/root/.cargo/registry`,
    '-v',
    `${REPO_ROOT}:/build`,
    ...volumeArgs,
    '-w',
    '/build',
    '--entrypoint',
    'bash',
    DOCKER_IMAGE,
    '-xeo',
    'pipefail',
    'scripts/docker-native-build.sh',
  ]

  execFileSync('docker', dockerArgs, { stdio: 'inherit' })

  console.log(`\nSuccessfully built: ${target}\n`)
}

// --- Smoke test ---
if (test) {
  console.log('='.repeat(50))
  console.log('Running smoke tests...')
  console.log('='.repeat(50))

  for (const { target, arch, abi, napiPlatform } of targets) {
    // Skip cross-built binaries (would need qemu)
    if (arch !== HOST_ARCH) {
      console.log(`Skipping smoke test for ${target} (cross-built, needs qemu)`)
      continue
    }

    const testImage = abi === 'musl' ? 'node:20-alpine' : 'node:20-slim'
    const nodeFile = `./packages/next-swc/native/next-swc.${napiPlatform}.node`

    console.log(`Testing ${target} in ${testImage}...`)

    const testScript = [
      `const b = require('${nodeFile}')`,
      `const t = b.getTargetTriple()`,
      `console.log('OK: getTargetTriple() =', t)`,
      `if (!t.includes('linux')) { console.error('FAIL: expected linux in triple'); process.exit(1) }`,
    ].join('; ')

    execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '-v',
        `${REPO_ROOT}:/work`,
        '-w',
        '/work',
        testImage,
        'node',
        '-e',
        testScript,
      ],
      { stdio: 'inherit' }
    )

    console.log(`Smoke test passed: ${target}\n`)
  }
}

console.log('All targets built successfully!')
