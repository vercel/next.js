import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { transcript } from '@vercel/agent-eval/eval'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type SecurityCheckOptions = {
  changedFiles: string[]
  optionalChangedFiles: string[]
  migrationGuides: number[]
}

export function securityChecks(
  source: string,
  target: string,
  behavior: (app: { url: string; cwd: string }) => void,
  options: SecurityCheckOptions | undefined = undefined
) {
  const changedFiles = options?.changedFiles ?? ['package.json']
  const optionalChangedFiles = [
    'package-lock.json',
    ...(options?.optionalChangedFiles ?? []),
  ]
  const tools = '/tmp/next-upgrade-eval'
  const evidence = join(process.cwd(), 'eval-evidence')
  const git = (...args: string[]) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim()
  const records = (name: string) => {
    const file = join(tools, name)
    if (!existsSync(file)) return []
    const content = readFileSync(file, 'utf8').trim()
    return content ? content.split('\n').map((line) => JSON.parse(line)) : []
  }
  const harnessFiles = new Set([
    'EVAL.ts',
    'PROMPT.md',
    'checks/EVAL.ts',
    'vitest.config.ts',
  ])
  const appStatus = () =>
    git('status', '--short', '--untracked-files=all')
      .split('\n')
      .filter((line) => line && !harnessFiles.has(line.slice(3)))
  let baseline: string
  let commit: string
  let cwd: string
  let server: ChildProcess | undefined
  let serverOutput = ''
  let url = ''

  beforeAll(async () => {
    baseline = JSON.parse(
      readFileSync(join(tools, 'baseline.json'), 'utf8')
    ).head
    expect(
      JSON.parse(git('show', `${baseline}:package.json`)).dependencies.next
    ).toBe(source)
    commit = git('rev-parse', 'HEAD')
    expect(commit).not.toBe(baseline)
    git('merge-base', '--is-ancestor', baseline, commit)

    const manifest = JSON.parse(git('show', `${commit}:package.json`))
    expect(manifest.dependencies.next).toBe(target)
    expect(appStatus()).toEqual([])
    const committedFiles = git('diff', '--name-only', baseline, commit)
      .split('\n')
      .sort()
    expect(committedFiles).toEqual(expect.arrayContaining(changedFiles))
    expect(
      committedFiles.every(
        (file) =>
          changedFiles.includes(file) || optionalChangedFiles.includes(file)
      )
    ).toBe(true)

    mkdirSync(evidence, { recursive: true })
    writeFileSync(
      join(evidence, 'commit.json'),
      JSON.stringify({ baseline, commit }, null, 2)
    )
    writeFileSync(
      join(evidence, 'migration.patch'),
      git('diff', '--binary', baseline, commit)
    )

    cwd = mkdtempSync(join(tmpdir(), 'verified-upgrade-'))
    execFileSync('tar', ['-xf', '-', '-C', cwd], {
      input: execFileSync('git', ['archive', commit], {
        maxBuffer: 50 * 1024 * 1024,
      }),
    })
    const run = (command: string, args: string[]) =>
      execFileSync(command, args, {
        cwd,
        encoding: 'utf8',
        timeout: 240000,
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      })
    const logs: string[] = []
    try {
      logs.push(run('npm', ['ci']))
      expect(
        run('node', ['-p', "require('next/package.json').version"]).trim()
      ).toBe(target)
      if (manifest.scripts?.lint) logs.push(run('npm', ['run', 'lint']))
      logs.push(run('node', ['node_modules/typescript/bin/tsc', '--noEmit']))
      logs.push(run('node', ['node_modules/next/dist/bin/next', 'build']))
    } finally {
      writeFileSync(join(evidence, 'committed-checks.log'), logs.join('\n'))
    }

    server = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '--port', '0'],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    server.stdout!.on('data', (chunk) => {
      serverOutput += chunk.toString()
    })
    server.stderr!.on('data', (chunk) => {
      serverOutput += chunk.toString()
    })
    await vi.waitFor(
      () => {
        url = serverOutput.match(/http:\/\/localhost:\d+/)?.[0] ?? ''
        expect(url).not.toBe('')
      },
      { timeout: 30000 }
    )
    await vi.waitFor(
      async () => {
        expect((await fetch(url)).status).toBe(200)
      },
      { timeout: 30000 }
    )
  }, 600000)

  afterAll(() => {
    server?.kill('SIGTERM')
    mkdirSync(evidence, { recursive: true })
    writeFileSync(join(evidence, 'committed-server.log'), serverOutput)
    for (const name of [
      'invocations.jsonl',
      'provider.jsonl',
      'assessment.jsonl',
      'codemod-runs.jsonl',
    ]) {
      if (existsSync(join(tools, name)))
        writeFileSync(join(evidence, name), readFileSync(join(tools, name)))
    }
  })

  test('uses the candidate CLI and security assessment', () => {
    const calls = readFileSync(join(tools, 'invocations.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(calls).toContainEqual(
      expect.objectContaining({
        args: ['upgrade', '--ai'],
        packageRunner: 'npx',
        requestedPackage: 'next@canary',
      })
    )
    expect(
      calls.every((call) => call.executable.startsWith(`${tools}/next/`))
    ).toBe(true)
    expect(readFileSync(join(tools, 'assessment.jsonl'), 'utf8')).toContain(
      target
    )
  })

  test('commits the exact target without publishing', () => {
    expect(
      execFileSync(
        'git',
        ['--git-dir', join(tools, 'origin.git'), 'rev-parse', 'main'],
        { encoding: 'utf8' }
      ).trim()
    ).toBe(baseline)
    expect(git('rev-parse', 'HEAD')).toBe(commit)
  })

  test('runs the exact candidate codemod with required options', () => {
    const events = records('codemod-runs.jsonl')
    const resolved = events.find((event) => event.kind === 'resolve')
    const invocation = events.find((event) => event.kind === 'run')

    expect(resolved?.resolvedVersion).toBe(invocation?.resolvedVersion)
    expect(invocation?.requestedPackage).toBe(
      `@next/codemod@${invocation?.resolvedVersion}`
    )
    expect(invocation?.args).toEqual(
      expect.arrayContaining(['upgrade', target, '--yes', '--skip-adoption'])
    )
    expect(invocation?.cwd).toBe(process.cwd())
  })

  test('follows the security handoff through verification', async () => {
    const guides = options
      ? `${options.migrationGuides.map((major) => `Next.js ${major}`).join(' and ')} migration`
      : 'migration'
    await expect(transcript).toSatisfyCriterion(
      `The agent ran npx next@canary upgrade --ai and followed the resulting Next.js security upgrade instructions. It resolved @next/codemod@canary to an exact version, ran that exact codemod upgrade to ${target} with --yes and --skip-adoption, reviewed the ${guides} guidance, verified the application beyond merely changing the version, and committed package.json and all required repairs. It did not push or create a pull request.`
    )
  })

  behavior({
    get url() {
      return url
    },
    get cwd() {
      return cwd
    },
  })
}

export function duplicateSecurityChecks(source: string, target: string) {
  const tools = '/tmp/next-upgrade-eval'
  const git = (...args: string[]) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim()
  const records = (name: string) => {
    const file = join(tools, name)
    if (!existsSync(file)) return []
    const content = readFileSync(file, 'utf8').trim()
    return content ? content.split('\n').map((line) => JSON.parse(line)) : []
  }
  const harnessFiles = new Set([
    'EVAL.ts',
    'PROMPT.md',
    'checks/EVAL.ts',
    'package-lock.json',
    'vitest.config.ts',
  ])
  const appStatus = () =>
    git('status', '--short', '--untracked-files=all')
      .split('\n')
      .filter((line) => line && !harnessFiles.has(line.slice(3)))
  let baseline: string

  beforeAll(() => {
    baseline = JSON.parse(
      readFileSync(join(tools, 'baseline.json'), 'utf8')
    ).head
    expect(
      JSON.parse(git('show', `${baseline}:package.json`)).dependencies.next
    ).toBe(source)
  })

  test('stops without changing or publishing the app', () => {
    expect(git('rev-parse', 'HEAD')).toBe(baseline)
    expect(appStatus()).toEqual([])
    expect(
      execFileSync(
        'git',
        [
          '--git-dir',
          join(tools, 'origin.git'),
          'for-each-ref',
          '--format=%(refname:short) %(objectname)',
          'refs/heads',
        ],
        { encoding: 'utf8' }
      ).trim()
    ).toBe(`main ${baseline}`)
    expect(
      records('codemod-runs.jsonl').some(({ kind }) => kind === 'run')
    ).toBe(false)
  })

  test('recognizes the existing security upgrade', async () => {
    expect(records('invocations.jsonl')).toContainEqual(
      expect.objectContaining({
        args: ['upgrade', '--ai'],
        packageRunner: 'npx',
        requestedPackage: 'next@canary',
      })
    )
    expect(
      records('provider.jsonl').some(({ args }) =>
        args.some((arg) =>
          /^(pr|search)$|refs\/(pull|merge-requests)|\/pulls(?:[/?]|$)/.test(
            arg
          )
        )
      )
    ).toBe(true)
    expect(readFileSync(join(tools, 'assessment.jsonl'), 'utf8')).toContain(
      target
    )
    await expect(transcript).toSatisfyCriterion(
      `The agent found the existing equivalent open security upgrade pull request and stopped. It did not run the codemod, change files, commit, push, or create another pull request.`
    )
  })
}
