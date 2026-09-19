import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type SecurityCheckOptions = {
  changedFiles: string[]
  migrationGuides: number[]
}

export function securityChecks(
  source: string,
  target: string,
  behavior: (app: { url: string; cwd: string }) => void,
  options: SecurityCheckOptions | undefined = undefined
) {
  void options
  const tools = '/tmp/next-upgrade-eval'
  const evidence = join(process.cwd(), 'eval-evidence')
  const git = (...args: string[]) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim()
  let baseline: string
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
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(manifest.dependencies.next).toBe(target)

    cwd = process.cwd()
    server = spawn('npm', ['run', 'dev', '--', '--port', '0'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    })
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

  test('does not publish the migration', () => {
    expect(
      execFileSync(
        'git',
        ['--git-dir', join(tools, 'origin.git'), 'rev-parse', 'main'],
        { encoding: 'utf8' }
      ).trim()
    ).toBe(baseline)
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
