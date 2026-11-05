import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
import { resolveFixturePath } from '../../../lib/next-testing-fixtures.cjs'

const cleanupVariants = {
  'public-default-cleanup': [
    'final-repeated-captured',
    'all-stages-success',
    'before-attempt-rejection',
  ],
  'default-cleanup-native': [
    'native-click-after-captured',
    'all-stages-success',
    'before-attempt-rejection',
    'deferred-awaited',
    'deferred-ignored',
  ],
  'component-cleanup-native': [
    'component-native-awaited',
    'component-native-ignored',
    'component-error-getter-native',
    'component-method-getter-native',
  ],
  'mixed-cleanup': [
    'keyboard-wrapper-getters',
    'component-keyboard-worker-same',
  ],
}

function cleanupProfiles(group, browsers) {
  const profiles = []
  for (const browser of browsers)
    for (const mode of ['development', 'production']) {
      const variants = [...cleanupVariants[group]]
      if (group === 'public-default-cleanup' && browser === 'firefox')
        variants.push('focus-outside-before-final')
      for (const variant of variants) {
        const prefix =
          group !== 'default-cleanup-native'
            ? ''
            : variant.startsWith('deferred-')
              ? 'deferred-'
              : variant === 'native-click-after-captured'
                ? 'final-'
                : 'before-'
        const sourcePrefix =
          group === 'default-cleanup-native' &&
          ['all-stages-success', 'before-attempt-rejection'].includes(variant)
            ? 'before-'
            : ''
        profiles.push({
          browser,
          mode,
          variant,
          label: `${prefix}${browser}-${mode}-${variant}`,
          source: `${sourcePrefix}${variant}.test.mjs.txt`,
        })
      }
    }
  return profiles
}

/** Check the cleanup contract rather than a serialized copy of every report field. */
export function assertCleanupBehavior(group, variant, report, trace, exit) {
  const cases = report.testResults.flatMap((file) => file.assertionResults)
  const rows = trace.records
    .filter((event) => event.hook === 'console')
    .flatMap((event) =>
      event.log.content
        .split('\n')
        .filter((line) => line.startsWith('BROWSER_NATIVE_FIXTURE:'))
        .map((line) => JSON.parse(line.slice('BROWSER_NATIVE_FIXTURE:'.length)))
    )
  const end = trace.records.filter((event) => event.hook === 'end')
  assert.equal(end.length, 1)
  const failed = variant === 'before-attempt-rejection'
  const count = variant === 'all-stages-success' ? 3 : 2
  const prefix =
    group === 'component-cleanup-native'
      ? 'component native'
      : group === 'mixed-cleanup'
        ? 'keyboard cleanup occurrence'
        : 'public cleanup'
  assert.deepEqual(
    cases.map((test) => test.fullName),
    Array.from(
      { length: count },
      (_, index) => `${prefix} ${String.fromCharCode(65 + index)}`
    )
  )
  assert.deepEqual(
    cases.map((test) => test.status),
    Array.from({ length: count }, (_, index) =>
      failed && index === 1 ? 'failed' : 'passed'
    )
  )
  assert.deepEqual(
    cases.map((test) => test.failureMessages),
    Array.from({ length: count }, (_, index) =>
      failed && index === 1 ? ['public default cleanup rejected'] : []
    )
  )
  assert.equal(report.numTotalTests, count)
  assert.equal(report.numPassedTests, count - Number(failed))
  assert.equal(report.numFailedTests, Number(failed))
  assert.equal(report.numPendingTests, 0)
  assert.equal(report.success, !failed)
  assert.equal(end[0].reason, failed ? 'failed' : 'passed')

  const expectedErrors =
    group === 'mixed-cleanup'
      ? (variant === 'component-keyboard-worker-same'
          ? ['component', 'keyboard', 'worker']
          : ['keyboard']
        ).map((stage) => ({
          name: 'FixtureCleanupError',
          message: `authored ${stage} cleanup failed`,
        }))
      : group === 'component-cleanup-native'
        ? variant === 'component-native-ignored'
          ? []
          : [
              {
                name: 'NativeComponentCleanupError',
                message: 'component native callback completed then rejected',
              },
            ]
        : failed || variant === 'all-stages-success'
          ? []
          : [
              {
                name: 'DefaultCleanupWrapperError',
                message: 'public default cleanup rejected',
              },
            ]
  assert.deepEqual(
    end[0].errors.map(({ name, message }) => ({ name, message })),
    expectedErrors
  )
  assert.equal(exit, failed || expectedErrors.length ? 1 : 0)
  const phase = (name) => rows.filter((row) => row.phase === name)
  const before = (first, second) => {
    const a = rows.findIndex((row) => row.phase === first)
    const b = rows.findIndex((row) => row.phase === second)
    assert(a >= 0 && b > a, `${first} must precede ${second}`)
  }
  for (const row of rows) {
    if ('receiver' in row) assert.equal(row.receiver, true, row.phase)
    if (
      row.phase.includes('physical-click') ||
      row.phase === 'cleanup-native-effect' ||
      row.phase === 'pending-native-effect'
    ) {
      if ('trusted' in row) assert.equal(row.trusted, true)
      assert.equal(row.shift, false)
      assert.equal(row.alt, false)
    }
  }
  if (group === 'mixed-cleanup') {
    before('keyboard-cleanup-start', 'keyboard-cleanup-end')
    before('keyboard-cleanup-end', 'worker-cleanup-start')
    assert.deepEqual(phase('worker-cleanup-end'), [
      { phase: 'worker-cleanup-end', clicks: 1, shifts: [false] },
    ])
    if (variant === 'component-keyboard-worker-same')
      before('component-cleanup', 'keyboard-cleanup-start')
    for (const stage of variant === 'component-keyboard-worker-same'
      ? ['component', 'keyboard', 'worker']
      : ['keyboard']) {
      const read = phase('cleanup-error-read').filter(
        (row) => row.stage === stage
      )
      assert.deepEqual(
        read.map((row) => row.key),
        ['name', 'message', 'stack']
      )
      assert.deepEqual(
        read.map((row) => row.value),
        ['FixtureCleanupError', `authored ${stage} cleanup failed`, '']
      )
      assert.equal(
        phase('cleanup-error-mutation').filter((row) => row.stage === stage)
          .length,
        1
      )
    }
  } else if (group === 'component-cleanup-native') {
    assert.equal(phase('component-read').length, 1)
    assert.equal(phase('component-call').length, 1)
    before('component-call', 'component-native-start')
    before('worker-cleanup-start', 'worker-cleanup-end')
    const clicks =
      variant === 'component-native-ignored'
        ? 1
        : variant === 'component-native-awaited'
          ? 2
          : 3
    assert.equal(phase('worker-cleanup-end')[0].clicks, clicks)
    if (variant === 'component-native-ignored') {
      before(
        'component-callback-returned-before-native',
        'worker-cleanup-start'
      )
      before('worker-await-started-component-native', 'late-physical-click')
      before('late-physical-click', 'worker-joined-component-native')
      assert.equal(phase('worker-joined-component-native')[0].lateClicks, 1)
    } else before('component-native-settled', 'worker-cleanup-start')
    if (variant === 'component-error-getter-native') {
      before('component-error-name', 'component-error-native-settled')
      before('component-error-native-settled', 'worker-joined-error-native')
      assert.equal(phase('component-error-name')[0].read, 1)
    }
    if (variant === 'component-method-getter-native') {
      before(
        'component-getter-native-settled',
        'component-joined-getter-native'
      )
      before('component-joined-getter-native', 'component-native-start')
    }
  } else {
    const calls = variant === 'all-stages-success' ? 4 : failed ? 3 : 1
    assert.deepEqual(
      phase('method-read').map((row) => row.read),
      Array.from({ length: calls }, (_, i) => i + 1)
    )
    assert.deepEqual(
      phase('method-call').map((row) => row.call),
      Array.from({ length: calls }, (_, i) => i + 1)
    )
    for (let call = 1; call <= calls; call++) {
      assert.deepEqual(
        rows
          .filter(
            (row) =>
              ['captured-call', 'captured-settled'].includes(row.phase) &&
              row.call === call
          )
          .map((row) => [row.phase, row.originalCall]),
        [
          ['captured-call', 1],
          ['captured-settled', 1],
          ['captured-call', 2],
          ['captured-settled', 2],
        ]
      )
    }
    before('A', 'worker-start')
    const clicks =
      variant === 'all-stages-success'
        ? 3
        : variant === 'native-click-after-captured'
          ? 2
          : 1
    assert.deepEqual(phase('worker-end'), [
      {
        phase: 'worker-end',
        clicks,
        shifts: Array(clicks).fill(false),
        alts: Array(clicks).fill(false),
      },
    ])
    if (variant === 'all-stages-success')
      assert.deepEqual(
        phase('native-keyup').map((row) => row.key),
        ['Shift', 'Alt']
      )
    else
      assert.deepEqual(
        phase(
          variant === 'focus-outside-before-final'
            ? 'outer-keyup'
            : 'native-keyup'
        ).map((row) => row.key),
        ['Shift']
      )
    if (variant === 'focus-outside-before-final')
      assert.deepEqual(phase('focus-outside'), [
        {
          phase: 'focus-outside',
          ownedBodyActive: true,
          outerBodyActive: true,
        },
      ])
    if (
      group === 'default-cleanup-native' &&
      ['all-stages-success', 'before-attempt-rejection'].includes(variant)
    ) {
      assert.equal(phase('cleanup-native-effect').length, calls)
      assert.equal(phase('cleanup-native-complete').length, calls)
      assert.equal(phase('cleanup-native-final-state')[0].nativeCalls, calls)
    }
    if (variant === 'native-click-after-captured')
      before('cleanup-native-click', 'worker-start')
    if (variant.startsWith('deferred-')) {
      before('pending-native-request', 'pending-native-target-ready')
      before('pending-native-target-ready', 'pending-native-effect')
      before('pending-native-effect', 'worker-joined-pending-native')
      assert.equal(phase('pending-native-effect')[0].clicks, 1)
      assert.equal(phase('worker-joined-pending-native')[0].pendingClicks, 1)
      if (variant === 'deferred-awaited')
        before('pending-native-awaited', 'worker-start')
      else before('callback-returning-with-pending', 'worker-start')
    }
  }
  return { cases: cases.length, authoredRows: rows.length }
}

export async function runCleanupRegressions(group) {
  const [
    rootArg,
    outputArg,
    enginesArg = 'chromium,firefox',
    kind = 'installed',
  ] = process.argv.slice(2)
  assert(rootArg && outputArg)
  assert(['source', 'installed'].includes(kind))
  const root = fs.realpathSync(rootArg)
  const output = path.resolve(outputArg)
  const browsers = enginesArg.split(',')
  assert(
    browsers.length &&
      new Set(browsers).size === browsers.length &&
      browsers.every((browser) => ['chromium', 'firefox'].includes(browser))
  )
  const corpus = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    `browser-${group}`
  )
  const load = createRequire(path.join(root, 'package.json'))
  const next =
    kind === 'source'
      ? path.join(root, 'packages/next/dist/bin/next')
      : load.resolve('next/dist/bin/next')
  fs.mkdirSync(output)
  const facts = []
  for (const profile of cleanupProfiles(group, browsers)) {
    const destination = path.join(output, profile.label)
    fs.mkdirSync(destination)
    const fixture = fs.mkdtempSync(path.join(root, '.next-test-cleanup-'))
    let started = false
    let joined = false
    try {
      fs.copyFileSync(
        resolveFixturePath(path.join(corpus, profile.source)),
        path.join(fixture, 'fixtures.test.mjs')
      )
      fs.copyFileSync(
        resolveFixturePath(path.join(corpus, 'reporter.mjs')),
        path.join(fixture, 'cleanup-reporter.mjs')
      )
      fs.writeFileSync(
        path.join(fixture, 'package.json'),
        '{"type":"module","private":true}\n'
      )
      fs.symlinkSync(
        path.join(root, 'node_modules'),
        path.join(fixture, 'node_modules'),
        'dir'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default ' + JSON.stringify({ turbopack: { root } }) + '\n'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify({
          test: {
            mode: profile.mode,
            maxWorkers: 1,
            include: ['fixtures.test.mjs'],
            environment: 'browser',
            browser: {
              enabled: true,
              headless: true,
              instances: [{ browser: profile.browser }],
            },
            testTimeout: 5000,
            hookTimeout: 5000,
            includeTaskLocation: false,
          },
        }) + '\n'
      )
      const reportFile = path.join(destination, 'report.json')
      const traceFile = path.join(destination, 'trace.jsonl')
      const env = {
        ...process.env,
        NODE_ENV: profile.mode,
        NEXT_TELEMETRY_DISABLED: '1',
        FORCE_COLOR: '0',
        CONCURRENCY_TRACE: traceFile,
      }
      for (const key of [
        'CI',
        'NODE_OPTIONS',
        'NODE_PATH',
        'NEXT_TEST_NATIVE_DIR',
        'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
      ])
        delete env[key]
      started = true
      const owner = await runOwnedNode(
        [
          next,
          'test',
          fixture,
          '--run',
          '--reporter=json',
          '--reporter=' + path.join(fixture, 'cleanup-reporter.mjs'),
          '--outputFile=' + reportFile,
        ],
        {
          cwd: fixture,
          env,
          auditDir: path.join(destination, 'owners'),
          timeoutMs: 120000,
        }
      )
      fs.writeFileSync(path.join(destination, 'stdout.log'), owner.stdout)
      fs.writeFileSync(path.join(destination, 'stderr.log'), owner.stderr)
      assertOwnedNodeCompleted(owner, profile.label)
      joined = true
      const report = JSON.parse(fs.readFileSync(reportFile))
      const trace = JSON.parse(fs.readFileSync(traceFile + '.complete.json'))
      facts.push({
        ...profile,
        ...assertCleanupBehavior(
          group,
          profile.variant,
          report,
          trace,
          owner.status
        ),
      })
      fs.writeFileSync(
        path.join(output, 'checks.json'),
        JSON.stringify({ facts }, null, 2) + '\n'
      )
    } finally {
      if (!started || joined)
        fs.rmSync(fixture, { recursive: true, force: true })
    }
  }
  const result = {
    profiles: facts.length,
    cases: facts.reduce((n, p) => n + p.cases, 0),
    authoredRows: facts.reduce((n, p) => n + p.authoredRows, 0),
    cleanupBehaviorAssertions: true,
    allOwnersClosed: true,
    allInputsRemovedAfterOwnedReadersJoined: true,
  }
  fs.writeFileSync(
    path.join(output, 'verified.json'),
    JSON.stringify(result, null, 2) + '\n'
  )
  console.log(JSON.stringify(result))
}
