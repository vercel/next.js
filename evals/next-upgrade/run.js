#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync, spawn } = require('node:child_process')
const { config: loadEnvironment } = require('dotenv')
const { packPackage } = require('../lib/pack')
require('tsx/cjs')
const { loadCase, materialize } = require('./runner/fixture.ts')
const root = path.resolve(__dirname, '../..')
const hash = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

function redact(value) {
  let text = value
  for (const name of [
    'VERCEL_OIDC_TOKEN',
    'AI_GATEWAY_API_KEY',
    'VERCEL_TOKEN',
  ]) {
    const secret = process.env[name]
    if (secret) {
      text = text.split(secret).join('[REDACTED]')
    }
  }
  return text
}

// Batch preparation uses the same pinned tools as standalone runs, before any
// agent credential files are written into a fork.
async function prepareToolchain(directory) {
  const { Sandbox } = require('@vercel/sandbox')
  const vm = await Sandbox.create({ runtime: 'node24', timeout: 600000 })
  try {
    const install = await vm.runCommand({
      cmd: 'npm',
      args: [
        'install',
        '--global',
        '--no-audit',
        '--no-fund',
        '@openai/codex@0.161.0',
        '@anthropic-ai/claude-code@2.1.293',
      ],
    })
    if (install.exitCode !== 0) {
      throw new Error(`Toolchain install failed: ${await install.stderr()}`)
    }
    const versions = await vm.runCommand({
      cmd: 'sh',
      args: ['-c', 'codex --version && claude --version && node --version'],
    })
    if (versions.exitCode !== 0) {
      throw new Error('Toolchain version preflight failed')
    }
    fs.writeFileSync(
      path.join(directory, 'toolchain.txt'),
      await versions.stdout()
    )
    return await vm.snapshot({ expiration: 86400000 })
  } finally {
    await vm.stop()
  }
}

// Let native capture/teardown finish on cancellation before deleting owned
// inputs and snapshots. Escalate only after its bounded teardown window.
async function runNative(command, args, options) {
  const child = spawn(command, args, { ...options, detached: true })
  let timer
  let cancelled = false
  const signalChild = (signal) => {
    try {
      process.kill(-child.pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH') {
        throw error
      }
      // The child may finish between receiving cancellation and forwarding it.
      console.log('Native process already exited during cancellation')
    }
  }
  const cancel = () => {
    if (timer || !child.pid) {
      return
    }
    cancelled = true
    signalChild('SIGINT')
    timer = setTimeout(() => signalChild('SIGKILL'), 55000)
  }
  process.on('SIGINT', cancel)
  process.on('SIGTERM', cancel)
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code) => resolve(cancelled ? 130 : (code ?? 130)))
    })
  } finally {
    clearTimeout(timer)
    process.off('SIGINT', cancel)
    process.off('SIGTERM', cancel)
  }
}

// Reject mismatched prepared inputs before allocating any remote resources.
function validatePreparedCandidate(provenance, expected) {
  for (const field of ['sourceRevision', 'originalVersion', 'nextSha256']) {
    if (provenance[field] !== expected[field]) {
      throw new Error(`Prepared stable candidate has mismatched ${field}`)
    }
  }
  if (
    provenance.declaredVersion !== '16.5.0' ||
    provenance.compiledVersion !== 'Next.js v16.5.0'
  ) {
    throw new Error('Prepared stable candidate has the wrong build identity')
  }
}

// Independent cleanup must continue after a failed deletion, and every failure
// must reach the caller instead of silently leaving owned resources behind.
async function cleanupOwned(tasks) {
  const results = await Promise.allSettled(
    tasks.map((task) => Promise.resolve().then(task))
  )
  const errors = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason)
  if (errors.length > 0) {
    throw new global.AggregateError(errors, 'Owned eval cleanup failed')
  }
}

// A stable test identity must be supplied before normal compilation. Build the
// same revision in an isolated checkout and remove only this invocation's tree.
function buildStableCandidate(runRoot, destination) {
  const checkout = path.join(runRoot, 'stable-build')
  const dirty = execFileSync('git', ['diff', 'HEAD', '--', 'packages/next'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (dirty) {
    throw new Error(
      'Commit or explicitly prepare the candidate runtime source before a stable-identity build'
    )
  }
  execFileSync('git', ['worktree', 'add', '--detach', checkout, 'HEAD'], {
    cwd: root,
    stdio: 'ignore',
  })
  try {
    fs.symlinkSync(
      path.join(root, 'node_modules'),
      path.join(checkout, 'node_modules'),
      'dir'
    )
    for (const name of fs.readdirSync(path.join(root, 'packages'))) {
      const modules = path.join(root, 'packages', name, 'node_modules')
      const directory = path.join(checkout, 'packages', name)
      if (fs.existsSync(modules) && fs.existsSync(directory)) {
        fs.symlinkSync(modules, path.join(directory, 'node_modules'), 'dir')
      }
    }
    const manifestPath = path.join(checkout, 'packages/next/package.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const originalVersion = manifest.version
    manifest.version = '16.5.0'
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    const log = fs.openSync(path.join(runRoot, 'stable-build.log'), 'w')
    try {
      execFileSync('pnpm', ['--filter=next', 'build'], {
        cwd: checkout,
        stdio: ['ignore', log, log],
      })
    } finally {
      fs.closeSync(log)
    }
    const compiledVersion = execFileSync(
      process.execPath,
      [path.join(checkout, 'packages/next/dist/bin/next'), '--version'],
      { encoding: 'utf8' }
    ).trim()
    if (compiledVersion !== 'Next.js v16.5.0') {
      throw new Error('Stable candidate compilation has the wrong identity')
    }
    packPackage(path.join(checkout, 'packages/next'), destination)
    return {
      sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      nextSha256: hash(destination),
      originalVersion,
      declaredVersion: '16.5.0',
      compiledVersion,
      method: 'normal build in isolated checkout',
    }
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', checkout], {
      cwd: root,
      stdio: 'ignore',
    })
  }
}

function preflight() {
  // Fail before paid execution when dependency installation omitted the pinned hooks.
  const nativeRoot = path.dirname(
    require.resolve('@vercel/agent-eval/package.json')
  )
  const nativeSource = fs.readFileSync(
    path.join(nativeRoot, 'dist/lib/agents/plugin/orchestrator.js'),
    'utf8'
  )
  const nativeRunner = fs.readFileSync(
    path.join(nativeRoot, 'dist/lib/runner.js'),
    'utf8'
  )
  if (
    !nativeSource.includes('options.agentOptions?.afterAgent') ||
    !nativeSource.includes('options.agentOptions?.beforeValidation') ||
    !nativeRunner.includes('AGENT_EVAL_HANDLE_SIGNALS')
  ) {
    throw new Error(
      'The pinned agent-eval lifecycle patch is missing; run pnpm install'
    )
  }

  if (!process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      'Pull a local VERCEL_OIDC_TOKEN from vercel-labs/next-agentic-upgrade first'
    )
  }
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_TOKEN) {
    throw new Error(
      'Unset AI_GATEWAY_API_KEY and VERCEL_TOKEN to use this suite’s explicit OIDC mode'
    )
  }
  for (const file of [
    'packages/next/dist/bin/next',
    'packages/next-codemod/bin/next-codemod.js',
  ]) {
    if (!fs.existsSync(path.join(root, file))) {
      throw new Error(`Missing build: ${file}`)
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const cases = fs.readdirSync(path.join(__dirname, 'cases')).sort()
  if (args.length === 1 && args[0] === '--list') {
    console.log(cases.join('\n'))
    return
  }
  const [name, flag] = args
  if (!cases.includes(name) || args.length > 2 || (flag && flag !== '--dry')) {
    throw new Error(
      `Select one case (${cases.join(', ')}), optionally with --dry`
    )
  }
  const scenario = loadCase(name)
  const harness = process.env.NEXT_UPGRADE_EVAL_EXPERIMENT
  if (harness && !['codex', 'claude'].includes(harness)) {
    throw new Error('Select codex or claude')
  }
  if (flag === '--dry') {
    console.log(name)
    return
  }
  loadEnvironment({ path: path.join(root, '.env.local'), override: false })
  loadEnvironment({ path: path.join(root, '.env'), override: false })
  preflight()
  const id =
    process.env.NEXT_UPGRADE_EVAL_RUN_ID ??
    `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(id)) {
    throw new Error('Invalid run ID')
  }
  const runRoot = path.join(__dirname, '.work', id)
  const retained = path.join(__dirname, 'results', id)
  const nextTarball = path.join(runRoot, 'tarballs/next.tgz')
  const codemodTarball = path.join(runRoot, 'tarballs/codemod.tgz')
  const trusted = path.join(retained, 'trusted')
  const experiments = harness ? [harness] : ['codex', 'claude']
  const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  const originalVersion = JSON.parse(
    fs.readFileSync(path.join(root, 'packages/next/package.json'))
  ).version
  fs.mkdirSync(path.join(runRoot, 'tarballs'), { recursive: true })
  fs.mkdirSync(path.join(retained, 'results'), { recursive: true })
  // Native agent-eval writes directly into retained results. No second result
  // tree or transcript copying is needed when the temporary fixtures are removed.
  fs.symlinkSync(
    path.join(retained, 'results'),
    path.join(runRoot, 'results'),
    'dir'
  )
  let snapshot
  let verifierSnapshot
  let candidateBuild = null
  try {
    const prepared = process.env.NEXT_UPGRADE_EVAL_PACKAGES
    if (prepared) {
      const provenance = JSON.parse(
        fs.readFileSync(path.join(prepared, 'packages.json'), 'utf8')
      )
      if (provenance.sourceRevision !== sourceRevision) {
        throw new Error('Prepared packages have mismatched source revision')
      }
      for (const file of ['next.tgz', 'codemod.tgz']) {
        if (hash(path.join(prepared, file)) !== provenance[file]) {
          throw new Error(`Prepared package checksum mismatch: ${file}`)
        }
      }
    }
    if (scenario.kind === 'nudge') {
      const stable = process.env.NEXT_UPGRADE_EVAL_STABLE_TARBALL
      if (stable) {
        fs.copyFileSync(stable, nextTarball)
        candidateBuild = JSON.parse(
          fs.readFileSync(
            path.join(path.dirname(stable), 'stable-provenance.json'),
            'utf8'
          )
        )
        validatePreparedCandidate(candidateBuild, {
          sourceRevision,
          originalVersion,
          nextSha256: hash(nextTarball),
        })
      } else {
        candidateBuild = buildStableCandidate(runRoot, nextTarball)
      }
    } else if (prepared) {
      fs.copyFileSync(path.join(prepared, 'next.tgz'), nextTarball)
    } else {
      packPackage(path.join(root, 'packages/next'), nextTarball)
    }
    if (prepared) {
      fs.copyFileSync(path.join(prepared, 'codemod.tgz'), codemodTarball)
    } else {
      packPackage(path.join(root, 'packages/next-codemod'), codemodTarball)
    }
    materialize(name, runRoot)
    const { loadFixture } = await import('@vercel/agent-eval')
    loadFixture(path.join(runRoot, 'evals'), name)
    // Freeze the trusted grader once alongside the native evidence. The agent
    // receives only its starting app, prompt and withheld EVAL.ts entry.
    for (const folder of ['verifier', 'cases']) {
      fs.cpSync(path.join(__dirname, folder), path.join(trusted, folder), {
        recursive: true,
      })
    }
    fs.cpSync(
      path.join(__dirname, 'apps/member-dashboard/behavior.spec.ts'),
      path.join(trusted, 'apps/member-dashboard/behavior.spec.ts')
    )
    fs.mkdirSync(path.join(runRoot, 'experiments'))
    for (const experiment of experiments) {
      fs.writeFileSync(
        path.join(runRoot, 'experiments', `${experiment}.ts`),
        `import { upgradeExperiment } from ${JSON.stringify(path.join(__dirname, 'runner/experiment.ts'))}\nexport default upgradeExperiment('${experiment === 'codex' ? 'codex' : 'claude-code'}')\n`
      )
    }
    if (!process.env.AGENT_EVAL_SANDBOX_SNAPSHOT_ID) {
      snapshot = await prepareToolchain(retained)
    }
    if (
      scenario.kind === 'direct' &&
      !process.env.NEXT_UPGRADE_EVAL_VERIFIER_SNAPSHOT_ID
    ) {
      verifierSnapshot = await require('./verifier/verify.ts').prepareVerifier()
    }
    fs.writeFileSync(
      path.join(retained, 'inputs.json'),
      JSON.stringify(
        {
          sourceRevision,
          case: name,
          scenario,
          experiments,
          candidateBuild,
          nextSha256: hash(nextTarball),
          codemodSha256: hash(codemodTarball),
        },
        null,
        2
      )
    )
    process.exitCode = await runNative(
      path.join(root, 'node_modules/.bin/agent-eval'),
      ['run', ...experiments, '--force', '--ack-failures'],
      {
        cwd: runRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          AGENT_EVAL_HANDLE_SIGNALS: '1',
          NEXT_UPGRADE_EVAL_CASE: name,
          NEXT_UPGRADE_EVAL_RUN_ROOT: runRoot,
          NEXT_UPGRADE_EVAL_RESULTS: retained,
          NEXT_UPGRADE_EVAL_TRUSTED_ROOT: trusted,
          NEXT_UPGRADE_EVAL_NEXT_TARBALL: nextTarball,
          NEXT_UPGRADE_EVAL_CODEMOD_TARBALL: codemodTarball,
          NEXT_UPGRADE_EVAL_NATIVE_BINDING_VERSION: originalVersion,
          AGENT_EVAL_PREPARE_FIXTURE_ONCE: '1',
          AGENT_EVAL_SANDBOX_SNAPSHOT_ID:
            snapshot?.snapshotId ?? process.env.AGENT_EVAL_SANDBOX_SNAPSHOT_ID,
          NEXT_UPGRADE_EVAL_VERIFIER_SNAPSHOT_ID:
            verifierSnapshot?.snapshotId ??
            process.env.NEXT_UPGRADE_EVAL_VERIFIER_SNAPSHOT_ID,
        },
      }
    )
    if (fs.readdirSync(path.join(retained, 'results')).length === 0) {
      throw new Error('Native runner produced no trial evidence')
    }
  } catch (error) {
    fs.writeFileSync(
      path.join(retained, 'setup-error.json'),
      redact(JSON.stringify({ status: 'invalid', error: String(error) }))
    )
    throw error
  } finally {
    await cleanupOwned([
      ...(snapshot ? [() => snapshot.delete()] : []),
      ...(verifierSnapshot ? [() => verifierSnapshot.delete()] : []),
      async () => fs.rmSync(runRoot, { recursive: true, force: true }),
    ])
    console.log(`Retained results: ${retained}`)
  }
}
if (require.main === module) {
  main().catch((error) => {
    console.error(
      redact(error instanceof Error ? error.message : String(error))
    )
    process.exitCode = 1
  })
}
module.exports = {
  main,
  validatePreparedCandidate,
  cleanupOwned,
  buildStableCandidate,
  prepareToolchain,
  runNative,
  preflight,
  hash,
  redact,
}
