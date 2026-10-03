import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type FutureChecksOptions = {
  trigger: 'direct' | 'nudge'
}

export function futureChecks(options: FutureChecksOptions) {
  void options
  const tools = '/tmp/next-upgrade-eval'
  const { source: sourceVersion, target: targetVersion } = JSON.parse(
    readFileSync(join(tools, 'security/assessment.json'), 'utf8')
  ) as { source: string; target: string }
  const npm = JSON.parse(
    readFileSync(join(tools, 'package-runner.json'), 'utf8')
  ).npm as string
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
    ).toBe(sourceVersion)

    const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(manifest.dependencies.next).toBe(targetVersion)
    const config = readFileSync('next.config.js', 'utf8')
    expect(config).toMatch(/cacheComponents\s*:\s*true/)

    const sourceFiles = git(
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      'app',
      'lib'
    )
      .split('\n')
      .filter((file) => /^(?:app|lib)\/.*\.[cm]?[jt]sx?$/.test(file))
    const source = sourceFiles
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
    expect(source).not.toMatch(
      /export\s+(?:const|var|let)\s+(?:dynamic|revalidate|fetchCache)\s*=/
    )
    expect(source).not.toMatch(
      /export\s+(?:const|var|let)\s+instant\s*=\s*false/
    )
    expect(source).not.toMatch(/TODO:\s*Cache Components adoption/)

    cwd = process.cwd()
    server = spawn(npm, ['run', 'dev', '--', '--port', '0'], {
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
  }, 600000)

  afterAll(() => {
    server?.kill('SIGTERM')
    mkdirSync(evidence, { recursive: true })
    writeFileSync(join(evidence, 'committed-server.log'), serverOutput)
    for (const name of [
      'assessment.jsonl',
      'codemod-runs.jsonl',
      'invocations.jsonl',
      'provider.jsonl',
      'skill-runs.jsonl',
    ]) {
      if (existsSync(join(tools, name))) {
        writeFileSync(join(evidence, name), readFileSync(join(tools, name)))
      }
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

  test('preserves request-specific and dynamic-route behavior', async () => {
    await Promise.all(
      ['Alice', 'Bob'].map(async (name) => {
        const response = await fetch(`${url}/account`, {
          headers: { cookie: `display-name=${name}` },
        })
        expect(response.status).toBe(200)
        const html = (await response.text()).replace(/<!--.*?-->/g, '')
        expect(html).toContain(`Welcome back, ${name}.`)
      })
    )

    const product = await fetch(`${url}/products/field-notes`)
    expect(product.status).toBe(200)
    expect(await product.text()).toContain('Field Notes')
  })

  test('leaves meaningful Cache Components boundaries', async () => {
    await expect(environment).toSatisfyCriterion(
      `Cache Components is fully enabled with no temporary route opt-outs. The account page still reads its cookie at request time beneath meaningful Suspense or loading UI so values cannot leak between visitors. The dynamic product page resolves params below a meaningful Suspense boundary while preserving useful route-independent shell content.`
    )
  })
}
