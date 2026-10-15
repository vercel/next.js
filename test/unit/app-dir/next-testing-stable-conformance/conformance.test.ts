import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'

const exec = promisify(execFile)
const referenceVersion = '5.0.4'
let reference: string
const nextBin = require.resolve('next/dist/bin/next')

interface Report {
  success: boolean
  numTotalTests: number
  numPassedTests: number
  numFailedTests: number
  numPendingTests: number
  numTodoTests: number
  numTotalTestSuites: number
  numPassedTestSuites: number
  numFailedTestSuites: number
  numPendingTestSuites: number
  snapshot: {
    uncheckedKeysByFile: { filePath: string; keys: string[] }[]
    filesRemovedList: string[]
    [field: string]: unknown
  }
  testResults: {
    assertionResults: {
      ancestorTitles: string[]
      title: string
      status: string
      failureMessages: string[]
    }[]
    message: string
    status: 'passed' | 'failed'
  }[]
}

async function invoke(
  runner: 'next' | 'vitest',
  root: string,
  filter: string,
  update = false,
  ci = false,
  testNamePattern?: string,
  nodeEnv: 'development' | 'production' = 'development'
) {
  const args =
    runner === 'next'
      ? [
          nextBin,
          'test',
          root,
          '--run',
          '--filter',
          filter,
          '--reporter',
          'json',
          '--outputFile',
          'result.json',
        ]
      : [
          reference,
          'run',
          filter,
          '--root',
          root,
          '--config',
          join(root, 'vitest.config.mjs'),
          '--reporter',
          'json',
          '--outputFile',
          join(root, 'result.json'),
        ]
  if (runner === 'vitest') args.push('--reporter=default')
  if (update) args.push('--update')
  if (testNamePattern !== undefined)
    args.push('--testNamePattern', testNamePattern)
  const result = await exec(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: nodeEnv,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      CI: ci ? '1' : undefined,
    },
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
  }).then(
    (output) => ({ ...output, code: 0 }),
    (error) => ({
      stdout: error.stdout as string,
      stderr: error.stderr as string,
      code: error.code as number,
    })
  )
  const report: Report = JSON.parse(
    await readFile(join(root, 'result.json'), 'utf8')
  )
  if (
    runner === 'next' &&
    report.numTotalTests === 0 &&
    filter !== 'collection.case'
  ) {
    throw new Error(
      report.testResults.map((file) => file.message).join('\n') ||
        (
          report as Report & {
            next?: {
              events?: { type: string; diagnostic?: { message: string } }[]
            }
          }
        ).next?.events
          ?.filter((event) => event.type === 'diagnostic')
          .map((event) => event.diagnostic?.message)
          .join('\n') ||
        result.stderr ||
        result.stdout ||
        `Next collected no cases (exit ${result.code})`
    )
  }
  return { ...result, report }
}
function outcomes(report: Report) {
  return {
    success: report.success,
    total: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    skipped: report.numPendingTests,
    todo: report.numTodoTests,
    cases: report.testResults.flatMap((file) =>
      file.assertionResults.map((test) => ({
        name: [...test.ancestorTitles, test.title],
        status: test.status,
        errors: test.failureMessages.map((message) => message.split('\n')[0]),
      }))
    ),
  }
}

function snapshotStatistics(report: Report, root: string) {
  return {
    ...report.snapshot,
    uncheckedKeysByFile: report.snapshot.uncheckedKeysByFile.map((file) => ({
      ...file,
      filePath: file.filePath.replace(root, '<root>'),
    })),
    filesRemovedList: report.snapshot.filesRemovedList.map((file) =>
      file.replace(root, '<root>')
    ),
  }
}

describe('Vitest 5.0.4 public CLI conformance', () => {
  let directory: string
  let roots: Record<'next' | 'vitest', string>
  beforeAll(async () => {
    directory = await mkdtemp(
      join(__dirname, '../../../../.next-test-conformance-')
    )
    const referenceRoot = join(directory, 'published-reference')
    await mkdir(referenceRoot)
    await writeFile(
      join(referenceRoot, 'package.json'),
      JSON.stringify({
        private: true,
        dependencies: { vitest: referenceVersion, vite: '8.3.4' },
      })
    )
    // Give the reference its own workspace root with no Next snapshot patch.
    // Exact-version age exceptions match the user-selected reference only.
    await writeFile(
      join(referenceRoot, 'pnpm-workspace.yaml'),
      'packages: []\nminimumReleaseAge: 2880\nminimumReleaseAgeExclude:\n' +
        [
          'vitest',
          '@vitest/expect',
          '@vitest/snapshot',
          '@vitest/spy',
          '@vitest/utils',
          '@vitest/mocker',
          '@vitest/pretty-format',
          '@vitest/runner',
        ]
          .map((name) => `  - '${name}@${referenceVersion}'\n`)
          .join('')
    )
    // Vitest 5 bundles its own snapshot code, but a separate installation also
    // keeps workspace hoisting and Next's patched standalone primitives out of
    // the golden runner's dependency graph.
    await exec('pnpm', ['install', '--ignore-scripts'], {
      cwd: referenceRoot,
      timeout: 120000,
    })
    const installed = JSON.parse(
      await readFile(
        join(referenceRoot, 'node_modules/vitest/package.json'),
        'utf8'
      )
    )
    const lock = await readFile(join(referenceRoot, 'pnpm-lock.yaml'), 'utf8')
    if (
      installed.version !== referenceVersion ||
      !/vitest@5\.0\.4:\s+resolution: \{integrity: sha512-z0WxZRV2Sg48wF0FSgMq3TFG8JS38\/Qr96vZVZdX6\+Em9raQTvnXQvdTFJe2m3rfyJnEHeHQ\/snceIdi8D1pVg==\}/.test(
        lock
      ) ||
      lock.includes('patchedDependencies:')
    ) {
      throw new Error(
        'Conformance requires the pristine published Vitest 5.0.4 artifact.'
      )
    }
    reference = join(referenceRoot, 'node_modules/vitest/vitest.mjs')
    roots = { next: join(directory, 'next'), vitest: join(directory, 'vitest') }
    for (const root of Object.values(roots)) {
      await mkdir(root)
      await cp(__dirname, root, {
        recursive: true,
        filter: (path) => !path.includes('node_modules'),
      })
      // The reference test body resolves into its pristine installation. Next
      // replaces authoring imports only inside its own compiled test graph.
      await symlink(
        root === roots.vitest
          ? join(referenceRoot, 'node_modules')
          : join(__dirname, '../../../../node_modules'),
        join(root, 'node_modules')
      )
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ private: true })
      )
    }
    await rm(join(roots.next, 'vitest.config.mjs'), { force: true })
    await writeFile(
      join(roots.vitest, 'vitest.config.mjs'),
      "export default { test: { include: ['*.case.mjs'] } }\n"
    )
  }, 120000)
  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('matches collection, parameterization, retry outcomes, fixtures, and lifecycle order without editing test bodies', async () => {
    const expected = await invoke('vitest', roots.vitest, 'lifecycle.case')
    const actual = await invoke('next', roots.next, 'lifecycle.case')
    expect(actual.code).toBe(expected.code)
    expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
    const trace = (text: string) =>
      JSON.parse(text.match(/CONFORMANCE_TRACE=(\[[^\n]*\])/)![1])
    // JSON mode retains attributed output in Next's event evidence.
    const nextReport = actual.report as Report & {
      next: { events: { type: string; text?: string }[] }
    }
    const nextOutput = nextReport.next.events
      .filter((event) => event.type === 'output')
      .map((event) => event.text)
      .join('')
    // Vitest's JSON reporter sends console output to stderr.
    expect(trace(nextOutput)).toEqual(trace(expected.stdout + expected.stderr))
  }, 120000)

  it('matches module collection failure without executing already declared bodies', async () => {
    const expected = await invoke('vitest', roots.vitest, 'collection.case')
    const actual = await invoke('next', roots.next, 'collection.case')
    expect(expected.code).toBe(1)
    expect(actual.code).toBe(expected.code)
    expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
    expect(actual.report.numTotalTests).toBe(0)
    expect(actual.report.testResults[0].message).toContain('collection failure')
    expect(actual.report.testResults[0].message.split('\n')[0]).toBe(
      'Error: collection failure'
    )
  }, 120000)

  it('counts empty, skipped, todo and hook-failing suites using execution metadata', async () => {
    const expected = await invoke('vitest', roots.vitest, 'suite-metadata.case')
    const actual = await invoke('next', roots.next, 'suite-metadata.case')
    expect(expected.code).toBe(1)
    expect(actual.code).toBe(expected.code)
    expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
    const counts = (report: Report) => ({
      total: report.numTotalTestSuites,
      passed: report.numPassedTestSuites,
      failed: report.numFailedTestSuites,
      pending: report.numPendingTestSuites,
    })
    expect(counts(expected.report)).toEqual({
      total: 7,
      passed: 3,
      failed: 3,
      pending: 1,
    })
    expect(counts(actual.report)).toEqual(counts(expected.report))
    expect(actual.report.testResults[0].message).toContain(
      'No test found in suite empty'
    )
    expect(actual.report.testResults[0].message).toContain(
      'nested cleanup failure'
    )
  }, 120000)

  it.each([
    '^root passes$',
    '^hook failure > nested passes$',
    'no matching cases',
  ])(
    'matches filtered suite and todo outcomes for %s',
    async (pattern) => {
      const expected = await invoke(
        'vitest',
        roots.vitest,
        'suite-metadata.case',
        false,
        false,
        pattern
      )
      const actual = await invoke(
        'next',
        roots.next,
        'suite-metadata.case',
        false,
        false,
        pattern
      )
      expect(actual.code).toBe(expected.code)
      expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
      for (const field of [
        'numTotalTestSuites',
        'numPassedTestSuites',
        'numFailedTestSuites',
        'numPendingTestSuites',
      ] as const) {
        expect(actual.report[field]).toEqual(expected.report[field])
      }
      expect(actual.report.numTodoTests).toBe(0)
    },
    120000
  )

  it('checks body assertion counts before teardown and finished listeners, retaining retries and original failures', async () => {
    const expected = await invoke(
      'vitest',
      roots.vitest,
      'assertion-counts.case'
    )
    const actual = await invoke('next', roots.next, 'assertion-counts.case')
    expect(expected.code).toBe(1)
    expect(actual.code).toBe(expected.code)
    expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
    expect(actual.report).toMatchObject({
      numTotalTests: 11,
      numPassedTests: 5,
      numFailedTests: 6,
    })
    const nextReport = actual.report as Report & {
      next: { events: { type: string; text?: string }[] }
    }
    const output = nextReport.next.events
      .filter((event) => event.type === 'output')
      .map((event) => event.text)
      .join('')
    const trace = (text: string) =>
      JSON.parse(text.match(/COUNT_TRACE=(\[[^\n]*\])/)![1])
    expect(trace(output)).toEqual(trace(expected.stdout + expected.stderr))
  }, 120000)

  it('matches independent and lazy local expectation counters, retry state and fixture access', async () => {
    const expected = await invoke('vitest', roots.vitest, 'local-expect.case')
    const actual = await invoke('next', roots.next, 'local-expect.case')
    expect(expected.code).toBe(1)
    expect(actual.code).toBe(expected.code)
    expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
    expect(actual.report).toMatchObject({
      numTotalTests: 11,
      numPassedTests: 5,
      numFailedTests: 6,
    })
    const nextReport = actual.report as Report & {
      next: { events: { type: string; text?: string }[] }
    }
    const output = nextReport.next.events
      .filter((event) => event.type === 'output')
      .map((event) => event.text)
      .join('')
    const trace = (text: string) =>
      JSON.parse(text.match(/LOCAL_EXPECT_TRACE=(\[[^\n]*\])/)![1])
    expect(trace(output)).toEqual(trace(expected.stdout + expected.stderr))
  }, 120000)

  it('matches task identity, result history, tag metadata, annotations and signal lifetime', async () => {
    const tags = [
      { name: 'low', priority: 20, meta: { fromLow: true, overlap: 'low' } },
      { name: 'high', priority: 1, meta: { fromHigh: true, overlap: 'high' } },
      { name: 'disabled', skip: true },
    ]
    const nextConfig = join(roots.next, 'next.test.config.json')
    const vitestConfig = join(roots.vitest, 'vitest.config.mjs')
    const previousNext = await readFile(nextConfig, 'utf8')
    const previousVitest = await readFile(vitestConfig, 'utf8')
    const config = JSON.parse(previousNext)
    for (const project of config.projects)
      Object.assign(project, { tags, strictTags: true })
    await writeFile(nextConfig, JSON.stringify(config))
    await writeFile(
      vitestConfig,
      `export default {test:{include:['*.case.mjs'],tags:${JSON.stringify(tags)},strictTags:true}}`
    )
    try {
      const expected = await invoke('vitest', roots.vitest, 'task-context.case')
      const actual = await invoke('next', roots.next, 'task-context.case')
      expect(expected.report.numTotalTests).toBe(11)
      expect(expected.code).toBe(1)
      expect(actual.code).toBe(expected.code)
      expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
      const nextReport = actual.report as Report & {
        next: {
          events: {
            type: string
            text?: string
            annotation?: { message: string; location?: { file: string } }
          }[]
        }
      }
      const output = nextReport.next.events
        .filter((event) => event.type === 'output')
        .map((event) => event.text)
        .join('')
      const trace = (text: string) =>
        JSON.parse(text.match(/TASK_CONTEXT_TRACE=(\[[^\n]*\])/)![1])
      expect(trace(output)).toEqual(trace(expected.stdout + expected.stderr))
      const metadata = (report: Report) =>
        report.testResults
          .flatMap((file) => file.assertionResults)
          .map((result) => ({
            ...result,
            fullName: undefined,
            duration: undefined,
            failureMessages: undefined,
          }))
      expect(metadata(actual.report)).toEqual(metadata(expected.report))
      const notes = nextReport.next.events.filter(
        (event) => event.type === 'test-annotation'
      )
      expect(notes.map((event) => event.annotation?.message)).toEqual([
        'notice',
        'text',
        'binary',
        'file note',
        'remote',
        'unawaited',
      ])
      expect(
        notes.every(
          (event) =>
            event.annotation?.location?.file ===
            join(roots.next, 'task-context.case.mjs')
        )
      ).toBe(true)
    } finally {
      await writeFile(nextConfig, previousNext)
      await writeFile(vitestConfig, previousVitest)
    }
  }, 120000)

  it('inverts expected failures before retry selection and retains exact fixture/listener/repeat ordering', async () => {
    const expected = await invoke(
      'vitest',
      roots.vitest,
      'expected-failure-retry.case'
    )
    const actual = await invoke(
      'next',
      roots.next,
      'expected-failure-retry.case'
    )
    expect(expected.code).toBe(1)
    expect(actual.code).toBe(expected.code)
    expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
    expect(actual.report).toMatchObject({
      numTotalTests: 4,
      numPassedTests: 3,
      numFailedTests: 1,
    })
    const nextReport = actual.report as Report & {
      next: { events: { type: string; text?: string }[] }
    }
    const output = nextReport.next.events
      .filter((event) => event.type === 'output')
      .map((event) => event.text)
      .join('')
    const trace = (text: string) =>
      JSON.parse(text.match(/FAILS_TRACE=(\[[^\n]*\])/)![1])
    expect(trace(output)).toEqual(trace(expected.stdout + expected.stderr))
  }, 120000)

  it('matches structured retries, conditions, delay, inheritance and published predicate removal', async () => {
    const expected = await invoke(
      'vitest',
      roots.vitest,
      'structured-retry.case'
    )
    const actual = await invoke('next', roots.next, 'structured-retry.case')
    expect(expected.code).toBe(1)
    expect(actual.code).toBe(expected.code)
    expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
    expect(actual.report).toMatchObject({
      numTotalTests: 25,
      numPassedTests: 16,
      numFailedTests: 8,
      numPendingTests: 1,
    })
    const output = (
      actual.report as Report & {
        next: { events: { type: string; text?: string }[] }
      }
    ).next.events
      .filter((event) => event.type === 'output')
      .map((event) => event.text)
      .join('')
    const trace = (text: string) =>
      JSON.parse(text.match(/RETRY_TRACE=(\[[^\n]*\])/)![1])
    expect(trace(output)).toEqual(trace(expected.stdout + expected.stderr))
    expect(trace(output)).toContain('delay elapsed:true')
    for (const title of [
      'multiline primitive message',
      'named failure without stack',
    ]) {
      const messages = (report: Report) =>
        report.testResults[0].assertionResults.find(
          (test) => test.title === title
        )!.failureMessages
      expect(messages(actual.report)).toEqual(messages(expected.report))
    }
  }, 120000)

  it('retains a failed earlier repeat in the final file result', async () => {
    const expected = await invoke('vitest', roots.vitest, 'failed-repeat.case')
    const actual = await invoke('next', roots.next, 'failed-repeat.case')
    expect(expected.code).toBe(1)
    expect(actual.code).toBe(expected.code)
    expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
    expect(actual.report.testResults[0].status).toBe(
      expected.report.testResults[0].status
    )
  }, 120000)

  it.each(['development', 'production'] as const)(
    'matches runtime skip bodies, hooks, fixtures, caught signals, retries and repeats in %s',
    async (mode) => {
      const configFile = join(roots.next, 'next.test.config.json')
      const config = await readFile(configFile, 'utf8')
      try {
        const selected = JSON.parse(config)
        selected.projects[0].mode = mode
        await writeFile(configFile, JSON.stringify(selected))
        const expected = await invoke(
          'vitest',
          roots.vitest,
          'runtime-skip.case',
          false,
          false,
          undefined,
          mode
        )
        const actual = await invoke(
          'next',
          roots.next,
          'runtime-skip.case',
          false,
          false,
          undefined,
          mode
        )
        expect(expected.code).toBe(0)
        expect(actual.code).toBe(expected.code)
        expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
        expect(actual.report).toMatchObject({
          numTotalTests: 16,
          numPassedTests: 1,
          numPendingTests: 15,
          numFailedTests: 0,
        })
        const nextReport = actual.report as Report & {
          next: {
            events: {
              type: string
              text?: string
              pending?: boolean
              note?: string
              errors?: unknown[]
            }[]
          }
        }
        const output = nextReport.next.events
          .filter((event) => event.type === 'output')
          .map((event) => event.text)
          .join('')
        const trace = (text: string) =>
          JSON.parse(text.match(/SKIP_TRACE=(\[[^\n]*\])/)![1])
        expect(trace(output)).toEqual(trace(expected.stdout + expected.stderr))
        expect(
          nextReport.next.events.some(
            (event) =>
              event.type === 'case-end' &&
              event.pending &&
              event.note === 'reason'
          )
        ).toBe(true)
        expect(
          nextReport.next.events.some(
            (event) =>
              event.type === 'case-end' && event.pending && event.errors?.length
          )
        ).toBe(true)
      } finally {
        await writeFile(configFile, config)
      }
    },
    120000
  )

  it('runs unchanged Chai and runtime type assertions without another controller', async () => {
    const expected = await invoke('vitest', roots.vitest, 'assertions.case')
    const actual = await invoke('next', roots.next, 'assertions.case')
    expect(actual.code).toBe(0)
    expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
  }, 120000)

  it('collects asynchronous, nested, skipped, and parameterized suites with their original ownership', async () => {
    const expected = await invoke('vitest', roots.vitest, 'async-suite.case')
    const actual = await invoke('next', roots.next, 'async-suite.case')
    expect(expected.code).toBe(0)
    expect(actual.code).toBe(expected.code)
    expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
  }, 120000)

  it('keeps the published API/configuration inventory aligned with the exact reference', async () => {
    await exec(process.execPath, [
      join(__dirname, '../../../../scripts/next-testing-compatibility.mjs'),
      '--check',
    ])
  })

  it('preserves deliberate failures and teardown errors', async () => {
    const expected = await invoke('vitest', roots.vitest, 'failure.case')
    const actual = await invoke('next', roots.next, 'failure.case')
    expect(actual.code).toBe(1)
    expect(actual.code).toBe(expected.code)
    expect(outcomes(actual.report)).toEqual(outcomes(expected.report))
    expect(actual.report.testResults[0].message).toContain(
      'retained teardown failure'
    )
  }, 120000)

  it('matches explicit external and inline snapshot bytes and their read round trip', async () => {
    for (const runner of ['vitest', 'next'] as const) {
      const update = await invoke(runner, roots[runner], 'snapshots.case', true)
      expect(update.code).toBe(0)
      expect((await invoke(runner, roots[runner], 'snapshots.case')).code).toBe(
        0
      )
    }
    for (const file of [
      'snapshots.case.mjs',
      '__snapshots__/snapshots.case.mjs.snap',
    ]) {
      expect(await readFile(join(roots.next, file), 'utf8')).toBe(
        await readFile(join(roots.vitest, file), 'utf8')
      )
    }
    const expected = await invoke('vitest', roots.vitest, 'snapshots.case')
    const actual = await invoke('next', roots.next, 'snapshots.case')
    expect(snapshotStatistics(actual.report, roots.next)).toEqual(
      snapshotStatistics(expected.report, roots.vitest)
    )
  }, 120000)

  it('matches local new-only snapshots, mismatch refusal, and CI read-only defaults', async () => {
    const original = await readFile(join(__dirname, 'policy.case.mjs'), 'utf8')
    const files = [
      'policy.case.mjs',
      '__snapshots__/policy.case.mjs.snap',
      'policy.txt',
    ]
    const results = []
    for (const runner of ['vitest', 'next'] as const) {
      const root = roots[runner]
      const create = await invoke(runner, root, 'policy.case')
      expect(create.code).toBe(0)
      const before = await Promise.all(
        files.map((file) => readFile(join(root, file), 'utf8'))
      )
      await writeFile(
        join(root, 'policy.case.mjs'),
        before[0].replaceAll("'first'", "'changed'")
      )
      const mismatch = await invoke(runner, root, 'policy.case')
      expect(mismatch.code).toBe(1)
      expect(await readFile(join(root, files[1]), 'utf8')).toBe(before[1])
      expect(await readFile(join(root, files[2]), 'utf8')).toBe(before[2])
      const update = await invoke(runner, root, 'policy.case', true)
      expect(update.code).toBe(0)
      const updated = await Promise.all(
        files.map((file) => readFile(join(root, file), 'utf8'))
      )
      await writeFile(join(root, 'policy.case.mjs'), original)
      await rm(join(root, files[1]))
      await rm(join(root, files[2]))
      const missing = await invoke(runner, root, 'policy.case', false, true)
      expect(missing.code).toBe(1)
      expect(await readFile(join(root, 'policy.case.mjs'), 'utf8')).toBe(
        original
      )
      for (const file of files.slice(1)) {
        await expect(readFile(join(root, file))).rejects.toMatchObject({
          code: 'ENOENT',
        })
      }
      results.push({
        initial: before,
        updated,
        create: outcomes(create.report),
        createSnapshots: snapshotStatistics(create.report, root),
        mismatch: outcomes(mismatch.report),
        mismatchSnapshots: snapshotStatistics(mismatch.report, root),
        missing: outcomes(missing.report),
        missingSnapshots: snapshotStatistics(missing.report, root),
      })
    }
    expect(results[1]).toEqual(results[0])
  }, 120000)

  it('matches obsolete-snapshot CI failure, full-update pruning, skipped preservation, and empty-file removal', async () => {
    const results = []
    for (const runner of ['vitest', 'next'] as const) {
      const root = roots[runner]
      const snapshot = join(root, '__snapshots__/pruning.case.mjs.snap')
      await writeFile(
        snapshot,
        '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\n' +
          'exports[`retained snapshot 1`] = `"retained"`;\n\n' +
          'exports[`skipped snapshot 1`] = `"skipped"`;\n\n' +
          'exports[`removed snapshot 1`] = `"removed"`;\n'
      )
      const obsolete = await invoke(runner, root, 'pruning.case', false, true)
      expect(obsolete.code).toBe(1)
      const prune = await invoke(runner, root, 'pruning.case', true)
      expect(prune.code).toBe(0)
      const content = await readFile(snapshot, 'utf8')
      expect(content).toContain('skipped snapshot 1')
      expect(content).not.toContain('removed snapshot')
      const empty = join(root, '__snapshots__/empty-pruning.case.mjs.snap')
      await writeFile(
        empty,
        '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\n' +
          'exports[`removed snapshot 1`] = `"removed"`;\n'
      )
      const remove = await invoke(runner, root, 'empty-pruning.case', true)
      expect(remove.code).toBe(0)
      await expect(readFile(empty)).rejects.toMatchObject({ code: 'ENOENT' })
      results.push({
        obsolete: outcomes(obsolete.report),
        obsoleteSnapshots: snapshotStatistics(obsolete.report, root),
        prune: outcomes(prune.report),
        pruneSnapshots: snapshotStatistics(prune.report, root),
        remove: outcomes(remove.report),
        removeSnapshots: snapshotStatistics(remove.report, root),
        content,
      })
    }
    expect(results[1]).toEqual(results[0])
  }, 120000)
})
