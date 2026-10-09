#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync, spawn } = require('node:child_process')
const { config: loadEnvironment, parse } = require('dotenv')
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
async function prepareToolchain(directory, signal) {
  const { Sandbox } = require('@vercel/sandbox')
  const vm = await Sandbox.create({
    runtime: 'node24',
    timeout: 600000,
    signal,
  })
  let stopping = null
  const stop = () => {
    if (!stopping) {
      stopping = Promise.resolve().then(() => vm.stop())
    }
    return stopping
  }
  // Stop the VM and unblock preparation even if installation never settles.
  let rejectAbort
  const aborted = new Promise((_, reject) => {
    rejectAbort = reject
  })
  const cancel = () => {
    stop().catch((error) => console.error('Toolchain teardown failed:', error))
    rejectAbort(signal.reason)
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    signal.throwIfAborted()
    const install = await Promise.race([
      vm.runCommand({
        cmd: 'npm',
        args: [
          'install',
          '--global',
          '--no-audit',
          '--no-fund',
          '@openai/codex@0.161.0',
          '@anthropic-ai/claude-code@2.1.293',
        ],
      }),
      aborted,
    ])
    signal.throwIfAborted()
    if (install.exitCode !== 0) {
      throw new Error(`Toolchain install failed: ${await install.stderr()}`)
    }
    const versions = await Promise.race([
      vm.runCommand({
        cmd: 'sh',
        args: ['-c', 'codex --version && claude --version && node --version'],
      }),
      aborted,
    ])
    signal.throwIfAborted()
    if (versions.exitCode !== 0) {
      throw new Error('Toolchain version preflight failed')
    }
    fs.writeFileSync(
      path.join(directory, 'toolchain.txt'),
      await versions.stdout()
    )
    const snapshot = await vm.snapshot({ expiration: 86400000 })
    if (signal.aborted) {
      await snapshot.delete()
      signal.throwIfAborted()
    }
    return snapshot
  } finally {
    signal.removeEventListener('abort', cancel)
    await stop()
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

// CI needs the CLI only to exchange the linked project's token for an OIDC
// token. Keep its private env file ephemeral and mask the result before export.
function authenticateCI() {
  for (const name of [
    'VERCEL_PROJECT_ID',
    'VERCEL_TEAM_ID',
    'VERCEL_TOKEN',
    'GITHUB_ENV',
  ]) {
    if (!process.env[name]) {
      throw new Error(`Missing CI authentication variable: ${name}`)
    }
  }
  const directory = path.join(__dirname, '.work')
  fs.mkdirSync(directory, { recursive: true })
  const temporary = fs.mkdtempSync(path.join(directory, 'auth-'))
  const file = path.join(temporary, 'credentials.env')
  const mask = process.umask(0o077)
  try {
    execFileSync(
      'vercel',
      [
        'env',
        'pull',
        file,
        '--yes',
        '--environment=development',
        '--scope',
        process.env.VERCEL_TEAM_ID,
        '--project',
        process.env.VERCEL_PROJECT_ID,
        '--token',
        process.env.VERCEL_TOKEN,
      ],
      { cwd: root, stdio: 'inherit' }
    )
    const token = parse(fs.readFileSync(file)).VERCEL_OIDC_TOKEN
    if (!token || /[\r\n]/.test(token)) {
      throw new Error('Vercel did not provide a single-line OIDC token')
    }
    console.log(`::add-mask::${token}`)
    fs.appendFileSync(process.env.GITHUB_ENV, `VERCEL_OIDC_TOKEN=${token}\n`)
  } finally {
    process.umask(mask)
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

// Cache only credential-free tooling; candidate packages and delivered source
// stay specific to this run. Missing or expiring remote IDs need replacements.
function snapshotKey() {
  const digest = crypto.createHash('sha256')
  for (const file of [
    'pnpm-lock.yaml',
    'evals/next-upgrade/run.js',
    'evals/next-upgrade/verifier/verify.ts',
    'evals/lib/setup.ts',
    'patches/@vercel__agent-eval@2.2.1.patch',
  ]) {
    digest.update(file).update(fs.readFileSync(path.join(root, file)))
  }
  return digest.digest('hex')
}

async function reusableSnapshot(id) {
  if (!id) {
    return null
  }
  const { Snapshot, APIError } = require('@vercel/sandbox')
  let snapshot
  try {
    snapshot = await Snapshot.get({ snapshotId: id })
  } catch (error) {
    if (!(error instanceof APIError) || error.response.status !== 404) {
      throw error
    }
    console.log(`Cached snapshot ${id} is missing; preparing a replacement`)
    return null
  }
  if (
    snapshot.status !== 'created' ||
    !snapshot.expiresAt ||
    snapshot.expiresAt.getTime() < Date.now() + 3600000
  ) {
    console.log(
      `Cached snapshot ${id} is unavailable or near expiry; preparing a replacement`
    )
    return null
  }
  return snapshot
}

// Each native process owns one fixture and independent agent forks. Inputs and
// trusted graders are shared locally; authoritative evidence stays per case.
async function runCase(name, context) {
  const { id, work, output, experiments, inputs, packages, snapshots, all } =
    context
  const runId = all ? `${id}.${name}` : id
  const runRoot = path.join(work, name)
  const retained = all ? path.join(__dirname, 'results', runId) : output
  const scenario = loadCase(name)
  const nextTarball =
    scenario.kind === 'nudge' ? packages.stable : packages.next
  fs.mkdirSync(path.join(retained, 'results'), { recursive: true })
  materialize(name, runRoot)
  fs.symlinkSync(
    path.join(retained, 'results'),
    path.join(runRoot, 'results'),
    'dir'
  )
  const { loadFixture } = await import('@vercel/agent-eval')
  loadFixture(path.join(runRoot, 'evals'), name)
  fs.mkdirSync(path.join(runRoot, 'experiments'))
  for (const experiment of experiments) {
    fs.writeFileSync(
      path.join(runRoot, 'experiments', `${experiment}.ts`),
      `import { upgradeExperiment } from ${JSON.stringify(path.join(__dirname, 'runner/experiment.ts'))}\nexport default upgradeExperiment('${experiment === 'codex' ? 'codex' : 'claude-code'}')\n`
    )
  }
  fs.writeFileSync(
    path.join(retained, 'inputs.json'),
    JSON.stringify(
      {
        sourceRevision: inputs.sourceRevision,
        case: name,
        scenario,
        experiments,
        candidateBuild: scenario.kind === 'nudge' ? inputs.stable : null,
        nextSha256:
          scenario.kind === 'nudge'
            ? inputs.stable.nextSha256
            : inputs['next.tgz'],
        codemodSha256: inputs['codemod.tgz'],
      },
      null,
      2
    )
  )
  const log = fs.openSync(path.join(output, `${name}.log`), 'w')
  const started = Date.now()
  let exitCode
  try {
    if (context.cancelled()) {
      throw new Error('Cancelled before case execution')
    }
    exitCode = await runNative(
      path.join(root, 'node_modules/.bin/agent-eval'),
      ['run', ...experiments, '--force', '--ack-failures'],
      {
        cwd: runRoot,
        stdio: ['ignore', log, log],
        env: {
          ...process.env,
          AGENT_EVAL_HANDLE_SIGNALS: '1',
          NEXT_UPGRADE_EVAL_CASE: name,
          NEXT_UPGRADE_EVAL_RUN_ROOT: runRoot,
          NEXT_UPGRADE_EVAL_RESULTS: retained,
          NEXT_UPGRADE_EVAL_TRUSTED_ROOT: path.join(output, 'trusted'),
          NEXT_UPGRADE_EVAL_NEXT_TARBALL: nextTarball,
          NEXT_UPGRADE_EVAL_CODEMOD_TARBALL: packages.codemod,
          NEXT_UPGRADE_EVAL_NATIVE_BINDING_VERSION: inputs.originalVersion,
          AGENT_EVAL_PREPARE_FIXTURE_ONCE: '1',
          AGENT_EVAL_SANDBOX_SNAPSHOT_ID: snapshots.toolchain,
          NEXT_UPGRADE_EVAL_VERIFIER_SNAPSHOT_ID: snapshots.verifier,
        },
      }
    )
  } finally {
    fs.closeSync(log)
  }
  const trials = experiments.map((agent) => {
    const file = path.join(retained, 'evidence', agent, 'verdict.json')
    const verdict = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : {
          status: 'invalid',
          reason: 'Missing authoritative verdict; inspect case log',
        }
    return {
      case: name,
      agent,
      runId,
      exitCode,
      durationMs: Date.now() - started,
      ...verdict,
    }
  })
  console.log(
    `${name}: ${trials.map((trial) => `${trial.agent}=${trial.status}`).join(', ')}`
  )
  return trials
}

// Keep successes brief. Print each affected case's authoritative verdicts and
// native log once, after parallel work settles, with workflow commands disabled.
function report(output, cases, summary) {
  const { trials, preparationMs, totalMs } = summary
  fs.writeFileSync(
    path.join(output, 'summary.json'),
    redact(JSON.stringify(summary, null, 2))
  )
  console.log(
    `Upgrade evals: ${trials.filter((trial) => trial.status === 'passed').length}/${trials.length} passed`
  )
  for (const name of cases) {
    const caseTrials = trials.filter((trial) => trial.case === name)
    const failures = caseTrials.filter((trial) => trial.status !== 'passed')
    const runnerFailed = caseTrials.some((trial) => trial.exitCode !== 0)
    if (!failures.length && !runnerFailed) {
      continue
    }
    console.log(`::group::${name}: failed or invalid eval diagnostics`)
    const token = crypto.randomBytes(16).toString('hex')
    console.log(`::stop-commands::${token}`)
    try {
      for (const trial of failures) {
        console.log(redact(JSON.stringify(trial, null, 2)))
      }
      if (!failures.length) {
        console.log(
          `Case runner exited unsuccessfully: ${caseTrials[0].exitCode}`
        )
      }
      const log = path.join(output, `${name}.log`)
      if (fs.existsSync(log)) {
        console.log(redact(fs.readFileSync(log, 'utf8')))
      }
    } finally {
      console.log(`::${token}::`)
      console.log('::endgroup::')
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Upgrade evals\n\nPreparation: ${Math.round(preparationMs / 1000)}s; total: ${Math.round(totalMs / 1000)}s.\n\n| Case | Agent | Result | Case duration |\n| --- | --- | --- | --- |\n` +
        trials
          .map(
            (trial) =>
              `| ${trial.case} | ${trial.agent} | ${trial.status} | ${Math.round((trial.durationMs ?? 0) / 1000)}s |`
          )
          .join('\n') +
        '\n'
    )
  }
  process.exitCode =
    summary.cancelled ||
    trials.some((trial) => trial.status !== 'passed' || trial.exitCode !== 0)
      ? 1
      : 0
}

async function main() {
  const args = process.argv.slice(2)
  const available = fs.readdirSync(path.join(__dirname, 'cases')).sort()
  if (args.length === 1 && args[0] === '--list') {
    console.log(available.join('\n'))
    return
  }
  if (args.length === 1 && args[0] === '--cache-key') {
    console.log(`${new Date().toISOString().slice(0, 10)}-${snapshotKey()}`)
    return
  }
  if (args.length === 1 && args[0] === '--ci-auth') {
    authenticateCI()
    return
  }
  const all = args.includes('--all')
  const cases = all ? available : args.filter((arg) => arg !== '--dry')
  if (
    (all && args.some((arg) => !['--all', '--dry'].includes(arg))) ||
    cases.length === 0 ||
    new Set(cases).size !== cases.length ||
    cases.some((name) => !available.includes(name))
  ) {
    throw new Error(
      `Select a case (${available.join(', ')}) or --all, optionally with --dry`
    )
  }
  const harness = process.env.NEXT_UPGRADE_EVAL_EXPERIMENT
  if (harness && (!['codex', 'claude'].includes(harness) || all)) {
    throw new Error(
      '--all runs both agents; select codex or claude only for individual cases'
    )
  }
  const experiments = harness ? [harness] : ['codex', 'claude']
  if (args.includes('--dry')) {
    console.log(
      JSON.stringify(
        cases.flatMap((name) =>
          experiments.map((agent) => ({ case: name, agent }))
        ),
        null,
        2
      )
    )
    return
  }
  loadEnvironment({ path: path.join(root, '.env.local'), override: false })
  loadEnvironment({ path: path.join(root, '.env'), override: false })
  preflight()
  const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
  const work = path.join(__dirname, '.work', id)
  const output = path.join(__dirname, 'results', id)
  fs.mkdirSync(path.join(work, 'packages'), { recursive: true })
  fs.mkdirSync(output, { recursive: true })
  const started = Date.now()
  let cancelled = false
  const preparation = new AbortController()
  const cancel = () => {
    cancelled = true
    preparation.abort(new Error('Cancelled during preparation'))
  }
  process.on('SIGINT', cancel)
  process.on('SIGTERM', cancel)
  const owned = []
  let cacheWritten = false
  try {
    // Pack once and build a stable identity once. Every case uses these immutable
    // inputs directly, eliminating the second runner and its env handoff.
    const packages = {
      next: path.join(work, 'packages/next.tgz'),
      codemod: path.join(work, 'packages/codemod.tgz'),
      stable: path.join(work, 'packages/stable-next.tgz'),
    }
    packPackage(path.join(root, 'packages/next'), packages.next)
    packPackage(path.join(root, 'packages/next-codemod'), packages.codemod)
    const inputs = {
      sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      originalVersion: JSON.parse(
        fs.readFileSync(path.join(root, 'packages/next/package.json'))
      ).version,
      'next.tgz': hash(packages.next),
      'codemod.tgz': hash(packages.codemod),
      stable: cases.some((name) => loadCase(name).kind === 'nudge')
        ? buildStableCandidate(work, packages.stable)
        : null,
    }
    fs.writeFileSync(
      path.join(output, 'inputs.json'),
      JSON.stringify(inputs, null, 2)
    )
    const trusted = path.join(output, 'trusted')
    for (const folder of ['verifier', 'cases']) {
      fs.cpSync(path.join(__dirname, folder), path.join(trusted, folder), {
        recursive: true,
      })
    }
    fs.cpSync(
      path.join(__dirname, 'apps/member-dashboard/behavior.spec.ts'),
      path.join(trusted, 'apps/member-dashboard/behavior.spec.ts')
    )

    // Cache misses prepare tooling in parallel; authentication/service errors
    // remain invalid runs. Track new snapshots until cancellation is ruled out.
    const cacheFile = process.env.NEXT_UPGRADE_EVAL_SNAPSHOT_CACHE
    const key = snapshotKey()
    const cached =
      cacheFile && fs.existsSync(cacheFile)
        ? JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
        : null
    const snapshots = {}
    const restored = {}
    const prepared = await Promise.allSettled(
      [
        ['toolchain', () => prepareToolchain(output, preparation.signal)],
        ...(cases.some((name) => loadCase(name).kind === 'direct')
          ? [
              [
                'verifier',
                () =>
                  require('./verifier/verify.ts').prepareVerifier(
                    preparation.signal
                  ),
              ],
            ]
          : []),
      ].map(async ([name, prepare]) => {
        const previous =
          cached?.key === key ? await reusableSnapshot(cached[name]) : null
        preparation.signal.throwIfAborted()
        restored[name] = Boolean(previous)
        const snapshot = previous ?? (await prepare())
        snapshots[name] = snapshot.snapshotId
        if (!previous) {
          owned.push(() => snapshot.delete())
        }
      })
    )
    const errors = prepared
      .filter((item) => item.status === 'rejected')
      .map((item) => item.reason)
    if (errors.length) {
      throw new global.AggregateError(errors, 'Snapshot preparation failed')
    }
    if (cancelled) {
      throw new Error('Cancelled during preparation')
    }
    if (cacheFile) {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
      fs.writeFileSync(
        cacheFile,
        JSON.stringify({ key, ...snapshots }, null, 2)
      )
      cacheWritten = true
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(
          process.env.GITHUB_OUTPUT,
          `snapshots-created=${Object.values(restored).includes(false)}\n`
        )
      }
    }
    const preparationMs = Date.now() - started
    fs.writeFileSync(
      path.join(output, 'infrastructure.json'),
      JSON.stringify(
        { snapshots, restored, preparationMs, cacheExpiresWithinHours: 24 },
        null,
        2
      )
    )
    const completed = await Promise.allSettled(
      cases.map((name) =>
        runCase(name, {
          id,
          work,
          output,
          experiments,
          inputs,
          packages,
          snapshots,
          all: cases.length > 1,
          cancelled: () => cancelled,
        })
      )
    )
    const trials = completed.flatMap((result, index) =>
      result.status === 'fulfilled'
        ? result.value
        : experiments.map((agent) => ({
            case: cases[index],
            agent,
            status: 'invalid',
            reason: redact(String(result.reason)),
          }))
    )
    trials.sort((a, b) =>
      `${a.case}/${a.agent}`.localeCompare(`${b.case}/${b.agent}`)
    )
    report(output, cases, {
      sourceRevision: inputs.sourceRevision,
      preparationMs,
      totalMs: Date.now() - started,
      cancelled,
      trials,
    })
  } catch (error) {
    fs.writeFileSync(
      path.join(output, 'setup-error.json'),
      redact(
        JSON.stringify(
          {
            status: 'invalid',
            error: String(error),
            causes:
              error instanceof global.AggregateError
                ? error.errors.map(String)
                : [],
          },
          null,
          2
        )
      )
    )
    throw error
  } finally {
    // CI saves even on an eval failure, but skips cancellation. Restored snapshots
    // are never ours to delete; new ones remain owned until this check.
    if (cacheWritten && !cancelled) {
      owned.length = 0
    }
    let retained = true
    try {
      await cleanupOwned([
        () => {
          const log = path.join(work, 'stable-build.log')
          if (fs.existsSync(log)) {
            try {
              fs.copyFileSync(log, path.join(output, 'stable-build.log'))
            } catch (error) {
              retained = false
              throw error
            }
          }
        },
        ...owned,
      ])
    } finally {
      if (retained) {
        fs.rmSync(work, { recursive: true, force: true })
      }
      process.off('SIGINT', cancel)
      process.off('SIGTERM', cancel)
    }
    console.log(`Retained results: ${output}`)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(redact(String(error)))
    if (error instanceof global.AggregateError) {
      for (const cause of error.errors) {
        console.error(redact(String(cause)))
      }
    }
    process.exitCode = 1
  })
}
