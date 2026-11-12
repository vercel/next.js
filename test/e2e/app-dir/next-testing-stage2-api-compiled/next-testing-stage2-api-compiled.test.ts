import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const generatedInstructions = join(__dirname, 'AGENTS.md')
let hadInstructions = false
beforeAll(async () => {
  try {
    await readFile(generatedInstructions)
    hadInstructions = true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
})
afterAll(async () => {
  if (!hadInstructions) await rm(generatedInstructions, { force: true })
})

const invoke = (
  filter: string,
  color = false,
  args: string[] = [],
  mode: 'development' | 'production' = 'development'
) =>
  promisify(execFile)(
    process.execPath,
    [
      require.resolve('next/dist/bin/next'),
      'test',
      __dirname,
      '--run',
      '--filter',
      filter,
      ...args,
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: mode,
        NEXT_TELEMETRY_DISABLED: '1',
        FORCE_COLOR: color ? '1' : '0',
      },
    }
  )

it('executes lifecycle callbacks in actual compiled Next test entries', async () => {
  const { stdout, stderr } = await invoke('lifecycle.case')
  expect(stdout).toMatch(/Tests\s+10 passed \(10\)/)
  expect(stdout + stderr).not.toContain('expected first-attempt failure')
  expect(stderr).not.toContain('Failed Tests')
  expect(stdout).not.toContain('\x1b[')
}, 120000)

it('retains snapshot bytes and reports listener errors when the compiled case fails', async () => {
  const path = join(__dirname, 'cases/__snapshots__/failure.case.ts.snap')
  const original = await readFile(path, 'utf8')
  const result = await invoke('failure.case', true).then(
    () => {
      throw new Error('Expected the actual compiled test to fail.')
    },
    (error) => error
  )
  expect(result.code).toBe(1)
  expect(result.stdout).toContain('\x1b[')
  expect(result.stderr).toContain('Failed Tests')
  expect(result.stdout + result.stderr).toContain(
    'C2_FAILURE_LISTENER_EXECUTED'
  )
  expect(result.stdout + result.stderr).toContain('failure listener retained')
  expect(await readFile(path, 'utf8')).toBe(original)
}, 120000)

it('writes compiled inline snapshots and passes their read-only round trip', async () => {
  const path = join(__dirname, 'cases/inline.case.ts')
  const original = await readFile(path, 'utf8')
  try {
    const update = await invoke('inline.case', false, ['--update'])
    expect(update.stdout).toMatch(/Tests\s+3 passed \(3\)/)
    const updated = await readFile(path, 'utf8')
    expect(updated).not.toBe(original)
    expect(updated).toContain('"compiled inline"')
    expect(updated).toContain('Any<Number>')
    expect(updated).toContain('"resolved inline"')
    const readonly = await invoke('inline.case')
    expect(readonly.stdout).toMatch(/Tests\s+3 passed \(3\)/)
    expect(await readFile(path, 'utf8')).toBe(updated)
  } finally {
    await writeFile(path, original)
  }
}, 120000)

it('filters original compiled test names using the public Vitest-compatible flag', async () => {
  const result = await invoke('lifecycle.case', false, [
    '-t',
    'override > overridden fixture',
  ])
  expect(result.stdout).toMatch(/Tests\s+1 passed \| 9 skipped \(10\)/)
}, 120000)

it('publishes JSON failures and attributed console evidence through the public CLI', async () => {
  const outcome = await invoke('failure.case', false, [
    '--reporter',
    'json',
  ]).catch((error) => error)
  expect(outcome.code).toBe(1)
  const report = JSON.parse(outcome.stdout)
  expect(report.success).toBe(false)
  expect(report.numFailedTests).toBeGreaterThan(0)
  expect(
    report.testResults[0].assertionResults[0].failureMessages.join('\n')
  ).toContain('failure listener retained')
  expect(
    report.next.events.some(
      (event: { type: string }) => event.type === 'case-end'
    )
  ).toBe(true)
}, 120000)

it('diagnoses unsupported Vitest subpaths without loading their installed controller', async () => {
  const outcome = await invoke('subpath.case').catch((error) => error)
  expect(outcome.code).toBe(1)
  expect(outcome.stdout + outcome.stderr).toContain(
    'Unsupported Vitest subpath'
  )
  expect(outcome.stdout).toMatch(/Tests\s+no tests/)
}, 120000)

it('merges real sharded CLI results without recompiling or losing a failure', async () => {
  const inlinePath = join(__dirname, 'cases/inline.case.ts')
  const originalInline = await readFile(inlinePath, 'utf8')
  const directory = await mkdtemp(join(tmpdir(), 'next-cli-blob-'))
  const output = join(
    directory,
    '../' + directory.split('/').at(-1) + '-merged.json'
  )
  try {
    for (const shard of [1, 2]) {
      await invoke('.case.ts', false, [
        '--shard',
        `${shard}/2`,
        '--reporter',
        'blob',
        '--outputFile',
        join(directory, `shard-${shard}.json`),
      ]).catch((error) => {
        if (error.code !== 1) throw error
      })
    }
    const merged = await promisify(execFile)(process.execPath, [
      require.resolve('next/dist/bin/next'),
      'test',
      __dirname,
      '--merge-reports',
      directory,
      '--reporter',
      'json',
      '--outputFile',
      output,
    ]).catch((error) => error)
    expect(merged.code).toBe(1)
    const report = JSON.parse(await readFile(output, 'utf8'))
    expect(report.success).toBe(false)
    expect(report.numTotalTests).toBe(14)
    expect(report.numFailedTests).toBeGreaterThan(0)
    expect(merged.stdout + merged.stderr).not.toContain('compilation')
  } finally {
    await writeFile(inlinePath, originalInline)
    await rm(directory, { recursive: true, force: true })
    await rm(output, { force: true })
  }
}, 120000)

it.each([
  { environment: 'node', mode: 'production', context: 'file' },
  { environment: 'rsc', mode: 'development', context: 'file' },
  { environment: 'rsc', mode: 'production', context: 'file' },
  { environment: 'browser', mode: 'development', context: 'file' },
  { environment: 'browser', mode: 'production', context: 'file' },
] as const)(
  'round-trips inline snapshots through the real $environment $mode $context context and cleanup',
  async (profile) => {
    const { environment, mode } = profile
    const configuration = join(__dirname, 'next.test.config.json')
    const source = join(__dirname, 'cases/inline.case.ts')
    const originalConfig = await readFile(configuration, 'utf8')
    const originalSource = await readFile(source, 'utf8')
    try {
      await writeFile(
        configuration,
        JSON.stringify({
          projects: [
            {
              name: 'api',
              environment,
              mode,
              include: ['cases/inline.case.ts'],
            },
          ],
        })
      )
      const update = await invoke('inline.case', false, ['--update'], mode)
      expect(update.stdout).toMatch(/Tests\s+3 passed \(3\)/)
      const updated = await readFile(source, 'utf8')
      expect(updated).not.toBe(originalSource)
      expect(updated).toContain('"compiled inline"')
      expect(updated).toContain('"resolved inline"')
      const read = await invoke('inline.case', false, [], mode)
      expect(read.stdout).toMatch(/Tests\s+3 passed \(3\)/)
      expect(await readFile(source, 'utf8')).toBe(updated)
    } finally {
      await writeFile(configuration, originalConfig)
      await writeFile(source, originalSource)
    }
  },
  180000
)
