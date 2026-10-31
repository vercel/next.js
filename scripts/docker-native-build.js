#!/usr/bin/env node
// Local wrapper for running native docker builds.
//
// Usage: node scripts/docker-native-build.js [flags] [filter]
//   --quick        Use release-with-assertions profile (no LTO, faster)
//   --host-target  Share host target/ dir with container for caching
//   --rebuild      Force a fresh Docker image build (docker build --no-cache)
//   --test         Smoke-test built binaries (native arch only)
//   filter         Substring match on target name (e.g. "musl", "x86_64")

const { execFileSync } = require('child_process')
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
const { parseArgs } = require('node:util')
const { values: flags, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    quick: { type: 'boolean', default: false },
    'host-target': { type: 'boolean', default: false },
    rebuild: { type: 'boolean', default: false },
    test: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
})

if (flags.help) {
  console.log(
    'Usage: node scripts/docker-native-build.js [--quick] [--host-target] [--rebuild] [--test] [filter]'
  )
  process.exit(0)
}

const quick = flags.quick
const hostTarget = flags['host-target']
const rebuild = flags.rebuild
const test = flags.test
const filter = positionals[0] || ''

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

function buildImage() {
  console.log(`Building Docker image: ${DOCKER_IMAGE}`)
  const ctx = fs.mkdtempSync(path.join(os.tmpdir(), 'next-swc-docker-'))
  fs.copyFileSync(
    path.join(REPO_ROOT, 'rust-toolchain.toml'),
    path.join(ctx, 'rust-toolchain.toml')
  )
  try {
    execFileSync(
      'docker',
      [
        'build',
        ...(rebuild ? ['--no-cache'] : []),
        '-t',
        DOCKER_IMAGE,
        '-f',
        path.join(REPO_ROOT, 'scripts/native-builder.Dockerfile'),
        ctx,
      ],
      { stdio: 'inherit' }
    )
  } finally {
    fs.rmSync(ctx, { recursive: true, force: true })
  }
}

buildImage()

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
const VOLUMES = [
  `${HOME}/.cargo/git:/root/.cargo/git`,
  `${HOME}/.cargo/registry:/root/.cargo/registry`,
  `${REPO_ROOT}:/build`,
]

for (const { target, arch, abi, napiPlatform } of targets) {
  console.log('='.repeat(50))
  console.log(`Building: ${target}`)
  console.log(`Docker:   ${DOCKER_IMAGE}`)
  console.log(`Task:     ${buildTask}`)
  console.log('='.repeat(50))

  // Clean only this target's previous build (preserve other targets' .node files)
  const nativeDir = path.join(REPO_ROOT, 'packages/next-swc/native')
  const nodeFile = path.join(nativeDir, `next-swc.${napiPlatform}.node`)
  if (fs.existsSync(nodeFile)) fs.unlinkSync(nodeFile)

  const ENV = {
    CI: '1',
    RUST_BACKTRACE: '1',
    CARGO_TERM_COLOR: 'always',
    CARGO_INCREMENTAL: '0',
    TARGET: target,
    ABI: abi,
    ARCH: arch,
    BUILD_TASK: buildTask,
  }

  const dockerArgs = [
    'run',
    '--rm',
    ...Object.entries(ENV).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
    ...VOLUMES.flatMap((v) => ['-v', v]),
    ...(hostTarget ? [] : ['-v', '/build/target']),
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
