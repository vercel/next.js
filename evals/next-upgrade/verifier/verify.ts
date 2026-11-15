import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SandboxManager } from '@vercel/agent-eval'
import type { EvalRunData } from '@vercel/agent-eval'
import { installPlaywright } from '../../lib/setup'
import type { Artifact, DeliveredTree } from '../runner/artifact'
import { suite, requiredChecks, type Scenario } from '../runner/fixture'

export type Verdict = {
  status: 'passed' | 'failed' | 'invalid'
  checks: Record<string, unknown>
  reason: string
}

// Prepare only trusted tools. Forking this credential-free snapshot saves browser
// setup time while each delivered app still gets its own clean verifier VM.
export async function prepareVerifier(signal: AbortSignal) {
  const sandbox = await SandboxManager.create({
    backend: 'vercel',
    runtime: 'node24',
    timeout: 600000,
  })
  let stopping: Promise<void> | null = null
  const stop = () => {
    if (!stopping) {
      stopping = Promise.resolve().then(() => sandbox.stop())
    }
    return stopping
  }
  // Keep setup cancellable while browser or package installation is blocked.
  let rejectAbort: (reason: unknown) => void
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject
  })
  const cancel = () => {
    stop().catch((error) => console.error('Verifier teardown failed:', error))
    rejectAbort(signal.reason)
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    signal.throwIfAborted()
    sandbox.setWorkingDirectory('/vercel/sandbox/verify')
    await Promise.race([
      sandbox.writeFiles({
        'package.json': JSON.stringify({
          private: true,
          type: 'module',
          dependencies: { vitest: '3.1.3', '@playwright/test': '1.51.1' },
        }),
      }),
      aborted,
    ])
    signal.throwIfAborted()
    const install = await Promise.race([
      sandbox.runCommand('npm', ['install', '--no-audit', '--no-fund']),
      aborted,
    ])
    signal.throwIfAborted()
    if (install.exitCode !== 0) {
      throw new Error(`Verifier tooling install failed: ${install.stderr}`)
    }
    await Promise.race([installPlaywright(sandbox), aborted])
    signal.throwIfAborted()
    const snapshot = await sandbox.snapshot({ expiration: 86400000 })
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

// The verifier receives only exported source and trusted tests. No Gateway key,
// agent state, cached build, node_modules, or mutable app test code is transferred.
let verifierCancelled = false

export async function verifyTree(
  tree: DeliveredTree,
  name: string,
  directory: string
): Promise<Verdict> {
  if (verifierCancelled) {
    throw new Error('App verification cancelled')
  }
  const trusted = process.env.NEXT_UPGRADE_EVAL_TRUSTED_ROOT ?? suite
  let sandbox: SandboxManager | null = null
  const cleanup: { pending: Promise<PromiseSettledResult<void>[]> | null } = {
    pending: null,
  }
  const cancel = () => {
    verifierCancelled = true
    if (sandbox && !cleanup.pending) {
      // Observe cleanup immediately, then report any rejection in finally.
      cleanup.pending = Promise.allSettled([sandbox.stop()])
    }
  }
  process.on('SIGINT', cancel)
  process.on('SIGTERM', cancel)
  try {
    sandbox = await SandboxManager.create({
      backend: 'vercel',
      runtime: 'node24',
      timeout: 1200000,
      snapshotId: process.env.NEXT_UPGRADE_EVAL_VERIFIER_SNAPSHOT_ID,
    })
    if (verifierCancelled) {
      throw new Error('App verification cancelled during VM creation')
    }
    const files = Object.entries(tree.files).map(([path, data]) => {
      if (
        path.startsWith('/') ||
        path.split('/').some((part) => part === '..')
      ) {
        throw new Error(`Unsafe artifact path ${path}`)
      }
      return {
        path: `/vercel/sandbox/app/${path}`,
        content: Buffer.from(data, 'base64'),
      }
    })
    await sandbox.uploadFiles(files)
    sandbox.setWorkingDirectory('/vercel/sandbox/verify')
    await sandbox.writeFiles({
      'package.json': JSON.stringify({
        private: true,
        type: 'module',
        dependencies: { vitest: '3.1.3', '@playwright/test': '1.51.1' },
      }),
      'EVAL.ts': readFileSync(join(trusted, 'cases', name, 'EVAL.ts'), 'utf8'),
      'validation/EVAL.ts': readFileSync(
        join(trusted, 'verifier/upgrade.ts'),
        'utf8'
      ),
      'apps/member-dashboard/behavior.spec.ts': readFileSync(
        join(trusted, 'apps/member-dashboard/behavior.spec.ts'),
        'utf8'
      ),
      'vitest.config.mjs':
        "export default { test: { include: ['EVAL.ts'], fileParallelism: false, maxWorkers: 1, minWorkers: 1 } }\n",
    })
    if (!process.env.NEXT_UPGRADE_EVAL_VERIFIER_SNAPSHOT_ID) {
      const install = await sandbox.runCommand('npm', [
        'install',
        '--no-audit',
        '--no-fund',
      ])
      if (install.exitCode !== 0) {
        throw new Error(`Verifier tooling install failed: ${install.stderr}`)
      }
      await installPlaywright(sandbox)
    }
    const result = await sandbox.runCommand(
      'node',
      [
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        'vitest.config.mjs',
      ],
      {
        env: {
          NEXT_UPGRADE_VERIFY_APP: '/vercel/sandbox/app',
          NEXT_UPGRADE_VERIFY_REPORT: '/tmp/verification.json',
          NEXT_TELEMETRY_DISABLED: '1',
        },
      }
    )
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      join(directory, 'vitest.txt'),
      result.stdout + '\n' + result.stderr
    )
    if (!(await sandbox.fileExists('/tmp/verification.json'))) {
      throw new Error('Verifier did not produce required check evidence')
    }
    const report = JSON.parse(await sandbox.readFile('/tmp/verification.json'))
    writeFileSync(
      join(directory, 'checks.json'),
      JSON.stringify(report, null, 2)
    )
    const required = requiredChecks('direct')
    const infra =
      report.installError &&
      /EAI_AGAIN|ENOTFOUND|ECONNRESET|ETIMEDOUT|E503|E429/.test(
        report.installError
      )
    const passed =
      result.exitCode === 0 &&
      required.every((check) => report.checks[check]?.passed === true)
    return {
      status: infra ? 'invalid' : passed ? 'passed' : 'failed',
      checks: report.checks,
      reason: infra
        ? 'Registry infrastructure error'
        : passed
          ? 'All required app checks passed'
          : 'Delivered app failed required checks',
    }
  } finally {
    try {
      if (!cleanup.pending && sandbox) {
        cleanup.pending = Promise.allSettled([sandbox.stop()])
      }
      if (cleanup.pending) {
        const [result] = await cleanup.pending
        if (result.status === 'rejected') {
          throw result.reason
        }
      }
    } finally {
      process.off('SIGINT', cancel)
      process.off('SIGTERM', cancel)
    }
  }
}

export async function verifyRun(
  name: string,
  scenario: Scenario,
  artifact: Artifact | null,
  native: EvalRunData,
  directory: string
): Promise<Verdict> {
  const nativeError = native.result.error ?? ''
  if (
    /HTTP (?:401|403|429)|unauthorized|invalid (?:auth|bearer|api)[ -]?(?:token|key)|authentication failed|rate_limit_error/i.test(
      nativeError
    )
  ) {
    return {
      status: 'invalid',
      checks: {},
      reason: `Native agent authentication/service error: ${nativeError}`,
    }
  }
  if (!artifact) {
    const failurePath = join(directory, 'capture-failure.json')
    if (existsSync(failurePath)) {
      const failure = JSON.parse(readFileSync(failurePath, 'utf8'))
      return {
        status: failure.kind === 'delivery' ? 'failed' : 'invalid',
        checks: { delivery: failure },
        reason: failure.reason,
      }
    }
    return {
      status: /Eval timed out/.test(native.result.error ?? '')
        ? 'failed'
        : 'invalid',
      checks: {},
      reason:
        native.result.error ??
        'Agent runner did not capture a delivered artifact',
    }
  }
  if (scenario.kind === 'nudge') {
    const file = join(directory, 'nudge-verdict.json')
    if (!existsSync(file)) {
      return {
        status: 'invalid',
        checks: {},
        reason: 'Native nudge grader produced no evidence',
      }
    }
    const report = JSON.parse(readFileSync(file, 'utf8'))
    const required = requiredChecks('nudge')
    if (
      !required.every(
        (check) => typeof report.checks[check]?.passed === 'boolean'
      )
    ) {
      return {
        status: 'invalid',
        checks: report.checks,
        reason: 'Missing required nudge check',
      }
    }
    if (
      !required
        .filter((check) => check !== 'notice-emitted')
        .every((check) => report.checks[check].judgeCompleted === true)
    ) {
      return {
        status: 'invalid',
        checks: report.checks,
        reason:
          'Judge execution did not produce a completed structured verdict',
      }
    }
    return {
      status: required.every((check) => report.checks[check].passed)
        ? 'passed'
        : 'failed',
      checks: report.checks,
      reason:
        'Notice emission, user communication and trust evaluated separately',
    }
  }
  // Inspect all actual worktrees. Agent-corrupted manifests are evaluated as
  // app failures instead of causing host parsing errors classified as invalid.
  const trees = artifact.trees
  const invocations = (artifact.evidence['invocations.jsonl'] ?? '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const commands = (artifact.evidence['commands.jsonl'] ?? '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const requested = invocations.filter((invocation) => {
    const args: string[] = invocation.args
    let selected: string | null = null
    for (let index = 1; index < args.length; index++) {
      if (args[index] === '--') {
        break
      }
      if (args[index].startsWith('--agent=')) {
        selected = args[index].slice('--agent='.length)
      } else if (args[index] === '--agent') {
        const value = args[index + 1]
        selected = value && !value.startsWith('-') ? value : 'security'
      }
    }
    return (
      args[0] === 'upgrade' &&
      invocation.executable.startsWith('/tmp/next-upgrade-eval/next/') &&
      selected === scenario.policy &&
      !args.some((arg) => ['--help', '-h', '--version', '-v'].includes(arg))
    )
  })
  const candidateInvoked =
    requested.length > 0 &&
    requested.every((invocation) => {
      const completions = commands.filter(
        (command) =>
          'exitCode' in command &&
          command.version === invocation.version &&
          (invocation.id
            ? command.id === invocation.id
            : JSON.stringify(command.args) === JSON.stringify(invocation.args))
      )
      return (
        completions.length > 0 &&
        completions.every((command) => command.exitCode === 0)
      )
    })
  const reports = []
  for (const [index, tree] of trees.entries()) {
    reports.push({
      path: tree.path,
      ...(await verifyTree(
        tree,
        name,
        join(directory, `verification-${index + 1}`)
      )),
    })
  }
  const passed = reports.find((report) => report.status === 'passed')
  return {
    status:
      passed && candidateInvoked && !native.result.error
        ? 'passed'
        : reports.some((report) => report.status === 'invalid')
          ? 'invalid'
          : 'failed',
    checks: {
      'candidate-cli': {
        passed: candidateInvoked,
        evidence:
          'Actual candidate invocation with requested policy and successful exit; no relevant command failure hidden',
      },
      deliveredWorktrees: reports,
    },
    reason: native.result.error
      ? `Native agent execution failed: ${native.result.error}`
      : !candidateInvoked
        ? 'Candidate upgrade invocation was missing, incomplete, or failed for the requested policy'
        : passed
          ? `Verified delivered app at ${passed.path}`
          : 'No delivered worktree satisfied the upgrade contract',
  }
}
