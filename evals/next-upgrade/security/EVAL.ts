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

export function securityChecks(
  source: string,
  target: string,
  behavior: (app: { url: string; cwd: string }) => void
) {
  const tools = '/tmp/next-upgrade-eval'
  const evidence = join(process.cwd(), 'eval-evidence')
  const git = (...args: string[]) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim()
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
    const lock = JSON.parse(git('show', `${commit}:package-lock.json`))
    expect(lock.packages?.['node_modules/next']?.version).toBe(target)
    expect(git('diff', '--name-only', 'HEAD', '--')).toBe('')

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
    for (const name of ['invocations.jsonl', 'assessment.jsonl']) {
      if (existsSync(join(tools, name)))
        writeFileSync(join(evidence, name), readFileSync(join(tools, name)))
    }
  })

  test('uses the candidate CLI and security assessment', () => {
    const calls = readFileSync(join(tools, 'invocations.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(
      calls.some(
        (call) => call.args[0] === 'upgrade' && call.args.includes('--ai')
      )
    ).toBe(true)
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

  test('follows the security handoff through verification', async () => {
    await expect(transcript).toSatisfyCriterion(
      `The agent ran next upgrade --ai and followed the resulting Next.js security upgrade instructions. It inspected Git history for an existing equivalent upgrade, resolved @next/codemod@canary to an exact version, ran that exact codemod upgrade to ${target} with --yes and --skip-adoption, reviewed the migration guidance, verified the application beyond merely changing the version, and committed package.json, package-lock.json, and all required repairs. It did not push or create a pull request.`
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
