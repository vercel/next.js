import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../../lib/next-testing-case-runner.mjs'
import { resolveFixturePath } from '../../../lib/next-testing-fixtures.cjs'

export async function runBrowserFixtureRegressions(family) {
  const [
    repoArg,
    outputArg,
    browsersArg = 'chromium,firefox',
    selection = 'all',
  ] = process.argv.slice(2)
  assert(
    repoArg && outputArg,
    'Expected installed consumer and output directory'
  )
  const repo = fs.realpathSync(repoArg)
  const output = path.resolve(outputArg)
  const browsers = browsersArg.split(',')
  assert(
    browsers.length > 0 &&
      browsers.every((browser) => ['chromium', 'firefox'].includes(browser)) &&
      new Set(browsers).size === browsers.length
  )
  assert(['all', 'representative'].includes(selection))
  const definitions = {
    'native-fixtures': [
      nativeProfiles,
      assertNativeFixtures,
      'BROWSER_NATIVE_FIXTURE:',
      'nativeBrowserFixturesCLI',
    ],
    'plain-fixtures': [
      plainProfiles,
      assertPlainFixtures,
      'BROWSER_FIXTURE:',
      'plainBrowserFixturesCLI',
    ],
    'public-concurrency': [
      concurrencyProfiles,
      assertConcurrency,
      'BROWSER_CONCURRENCY:',
      'publicBrowserConcurrencyCLI',
    ],
    'native-promise-calls': [
      promiseProfiles,
      assertPromiseCalls,
      'BROWSER_HOOK_SEQUENCE:',
      'ordinarySerialCLI',
    ],
  }
  const [profiles, check, prefix, feature] = definitions[family]
  const corpus = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    `browser-${family}`
  )
  const facts = []
  for (const profile of profiles(browsers).filter(
    (profile) => selection === 'all' || profile.representative
  )) {
    const promise = family === 'native-promise-calls'
    const target = promise
      ? 'action.test.mjs'
      : family === 'public-concurrency'
        ? 'concurrent.test.mjs'
        : 'fixtures.test.mjs'
    const sources = profile.sources ?? [
      { path: profile.source.path, filename: target },
    ]
    const failed =
      family === 'public-concurrency' && profile.group.endsWith('failure')
    const expectedCount = promise
      ? profile.group === 'retained'
        ? 2
        : 1
      : profile.group.endsWith('cross-files')
        ? 4
        : 2
    const result = await runCompilerCase({
      repo,
      output: path.join(output, profile.label),
      mode: profile.mode,
      files: sources.map((source) => ({
        target: source.filename,
        bytes: fs.readFileSync(
          resolveFixturePath(path.join(corpus, source.path))
        ),
      })),
      expectedCount,
      expectedExit: Number(failed),
      config: {
        maxWorkers: 1,
        projects: [
          {
            name: `browser-${family}`,
            environment: 'browser',
            mode: profile.mode,
            browser: {
              enabled: true,
              headless: true,
              instances: [{ browser: profile.browser }],
            },
            include: profile.include ?? [target],
            testTimeout: promise ? 1000 : 5000,
            hookTimeout: promise ? 1000 : 5000,
            includeTaskLocation: false,
            ...(promise ? {} : { maxConcurrency: profile.limit }),
            ...(profile.scheduling === 'configured'
              ? { sequence: { concurrent: true } }
              : {}),
          },
        ],
      },
      checkOutcomes(report) {
        assert.deepEqual(
          report.testResults.map((file) => path.basename(file.name)).sort(),
          sources
            .map((source) => source.filename)
            .filter((name) => name.endsWith('.test.mjs'))
            .sort()
        )
        for (const file of report.testResults) {
          assert.equal(file.message, '')
          assert.equal(
            file.status,
            file.assertionResults.some((test) => test.status === 'failed')
              ? 'failed'
              : 'passed'
          )
        }
        assert.deepEqual(
          report.next.events.filter(
            (event) =>
              event.type === 'diagnostic' &&
              event.diagnostic.severity === 'error'
          ),
          []
        )
        const rows = report.next.events
          .filter((event) => event.type === 'output')
          .flatMap((event) =>
            event.text
              .split('\n')
              .filter((line) => line.startsWith(prefix))
              .map((line) => JSON.parse(line.slice(prefix.length)))
          )
        check(
          {
            rows: promise ? rows : rows.map((value) => ({ value })),
            cases: report.testResults.flatMap((file) => file.assertionResults),
            success: report.success,
          },
          profile
        )
        assert.equal(report.next.summary.errors, Number(failed))
        facts.push({
          browser: profile.browser,
          mode: profile.mode,
          group: profile.group,
          cases: expectedCount,
          authoredRows: rows.length,
        })
      },
    })
    assert.equal(result.passed, true)
  }
  fs.writeFileSync(
    path.join(output, 'verified.json'),
    JSON.stringify(
      {
        profiles: facts.length,
        cases: facts.reduce((sum, fact) => sum + fact.cases, 0),
        authoredRows: facts.reduce((sum, fact) => sum + fact.authoredRows, 0),
        behaviorAssertions: true,
        [feature]: true,
        allOwnersClosed: true,
        allInputsRemovedAfterOwnedReadersJoined: true,
      },
      null,
      2
    ) + '\n'
  )
}

function nativeProfiles(browsers) {
  const scenarios = []
  for (const scope of ['test', 'file', 'worker'])
    for (const stage of ['setup', 'cleanup'])
      scenarios.push({
        group: `${scope}-${stage}`,
        scope,
        stage,
        source: `${scope}-${stage}.test.mjs.txt`,
        representative: stage === 'setup',
      })
  scenarios.push({
    group: 'worker-component-cleanup',
    label: 'component-worker-cleanup',
    scope: 'worker',
    stage: 'cleanup',
    source: 'component-worker-cleanup.test.mjs.txt',
    representative: true,
  })
  return browsers.flatMap((browser) =>
    ['development', 'production'].flatMap((mode) =>
      scenarios.map((scenario) => ({
        ...scenario,
        browser,
        mode,
        label: `${browser}-${mode}-${scenario.label ?? scenario.group}`,
        representative:
          scenario.group === 'worker-component-cleanup' ||
          scenario.stage === (mode === 'development' ? 'setup' : 'cleanup'),
        scheduling: 'serial',
        limit: 2,
        include: ['fixtures.test.mjs'],
        sources: [{ path: scenario.source, filename: 'fixtures.test.mjs' }],
      }))
    )
  )
}

function assertNativeFixtures(actual, profile) {
  const rows = actual.rows.map((row) => row.value ?? row)
  const phase = (name) => rows.filter((row) => row.phase === name)
  assert.equal(actual.success, true)
  assert.equal(
    actual.cases.length,
    profile.group.includes('cross-files') ? 4 : 2
  )
  assert(
    actual.cases.every(
      (test) => test.status === 'passed' && test.failureMessages.length === 0
    )
  )
  if (profile.group === 'worker-component-cleanup') {
    assert.deepEqual(
      phase('A').map((row) => row.clicks),
      [0]
    )
    assert.deepEqual(
      phase('B-mounted').map((row) => row.clicks),
      [0]
    )
    assert.deepEqual(
      phase('worker-cleanup-start').map((row) => row.clicks),
      [0]
    )
    assert.deepEqual(
      phase('worker-cleanup-end').map((row) => row.clicks),
      [1]
    )
    return
  }
  const setups = phase('setup-start'),
    cleanups = phase('cleanup-end')
  assert.equal(setups.length, profile.scope === 'test' ? 2 : 1)
  assert.equal(cleanups.length, setups.length)
  assert.deepEqual(
    setups.map((row) => row.id),
    Array.from({ length: setups.length }, (_, index) => index + 1)
  )
  assert(cleanups.every((row) => row.closed === true && row.clicks === 1))
  for (const setup of setups) {
    const events = rows.filter((row) => row.id === setup.id)
    assert.equal(events[0].phase, 'setup-start')
    assert.equal(events.at(-1).phase, 'cleanup-end')
    const ready = events.find((row) => row.phase === 'setup-end')
    assert.equal(ready.clicks, profile.stage === 'setup' ? 1 : 0)
  }
  const [a, b] = ['A', 'B'].map((name) => phase(name)[0])
  assert.equal(a.closed, false)
  assert.equal(b.closed, false)
  assert.equal(a.clicks, profile.stage === 'setup' ? 1 : 0)
  assert.equal(b.clicks, a.clicks)
  assert.equal(b.same, profile.scope !== 'test')
  assert.equal(b.firstClosed, profile.scope === 'test')
}

function plainProfiles(browsers) {
  const representative = new Set([
    'test-serial',
    'file-declared',
    'worker-serial',
    'worker-cross-files',
  ])
  const scenarios = []
  for (const scope of ['test', 'file', 'worker'])
    for (const scheduling of ['serial', 'declared'])
      scenarios.push({
        group: `${scope}-${scheduling}`,
        scope,
        scheduling,
        sources: [
          {
            path: `${scope}-${scheduling}.test.mjs.txt`,
            filename: 'fixtures.test.mjs',
          },
        ],
        include: ['fixtures.test.mjs'],
      })
  for (const scope of ['file', 'worker'])
    scenarios.push({
      group: `${scope}-cross-files`,
      scope,
      scheduling: 'serial',
      sources: [
        { path: `${scope}.shared.mjs.txt`, filename: 'shared.mjs' },
        { path: 'a.fixture.test.mjs.txt', filename: 'a.fixture.test.mjs' },
        { path: 'b.fixture.test.mjs.txt', filename: 'b.fixture.test.mjs' },
      ],
      include: ['*.fixture.test.mjs'],
    })
  return browsers.flatMap((browser) =>
    ['development', 'production'].flatMap((mode) =>
      scenarios.map((scenario) => ({
        ...scenario,
        browser,
        mode,
        label: `${browser}-${mode}-${scenario.group}`,
        limit: 2,
        representative:
          mode === 'development'
            ? representative.has(scenario.group)
            : !representative.has(scenario.group),
      }))
    )
  )
}

function assertPlainFixtures(actual, profile) {
  const rows = actual.rows.map((row) => row.value)
  const phase = (name) => rows.filter((row) => row.phase === name)
  const cross = profile.group.endsWith('cross-files')
  assert.equal(actual.success, true)
  assert.equal(actual.cases.length, cross ? 4 : 2)
  assert(
    actual.cases.every(
      (test) => test.status === 'passed' && test.failureMessages.length === 0
    )
  )
  const setups = phase('setup'),
    cleanups = phase('cleanup')
  const count = cross || profile.scope === 'test' ? 2 : 1
  assert.equal(setups.length, count)
  assert.equal(cleanups.length, count)
  assert(setups.every((row) => row.scope === profile.scope))
  assert(cleanups.every((row) => row.scope === profile.scope))
  if (cross) {
    const bodies = phase('body')
    assert.equal(bodies.length, 4)
    assert.deepEqual(
      bodies.map((row) => row.id),
      [1, 1, 1, 1]
    )
    for (const file of ['a', 'b']) {
      const owned = bodies.filter((row) => row.name.startsWith(file + ' '))
      assert.deepEqual(
        owned.map((row) => row.history),
        [[`${file} A`], [`${file} A`, `${file} B`]]
      )
      assert(
        cleanups.some(
          (row) =>
            JSON.stringify(row.history) ===
            JSON.stringify([`${file} A`, `${file} B`])
        )
      )
    }
    return
  }
  const a = phase('A-start')[0],
    b = phase('B-start')[0]
  assert.equal(a.closed, false)
  assert.equal(b.closed, false)
  assert.equal(a.id, 1)
  assert.equal(b.id, profile.scope === 'test' ? 2 : 1)
  assert.equal(phase('B-end')[0].aClosed, profile.scope === 'test')
  const phases = rows.map((row) => row.phase)
  assert.equal(
    phases.indexOf('B-start') < phases.indexOf('A-end'),
    profile.scheduling === 'declared'
  )
  assert.equal(
    Math.max(
      ...rows.filter((row) => 'active' in row).map((row) => row.active.length)
    ),
    profile.scheduling === 'declared' ? 2 : 1
  )
  assert.equal(
    phases.indexOf('cleanup') < phases.indexOf('B-start'),
    profile.scope === 'test' && profile.scheduling === 'serial'
  )
}

function concurrencyProfiles(browsers) {
  const representative = {
    development: new Set([
      'plain-configured-success',
      'native-declared-success',
      'native-declared-failure',
      'limits-declared-2',
    ]),
    production: new Set([
      'native-serial-success',
      'native-configured-success',
      'plain-declared-failure',
      'limits-configured-1',
    ]),
  }
  const scenarios = []
  for (const kind of ['plain', 'native'])
    for (const scheduling of ['serial', 'declared', 'configured'])
      for (const result of ['success', 'failure']) {
        const group = `${kind}-${scheduling}-${result}`
        scenarios.push({
          kind,
          scheduling,
          group,
          limit: 2,
          source: { path: group + '.test.mjs.txt' },
        })
      }
  for (const scheduling of ['declared', 'configured'])
    for (const limit of [1, 2])
      scenarios.push({
        kind: 'limits',
        scheduling,
        limit,
        group: `limits-${scheduling}-${limit}`,
        source: { path: `limits-${scheduling}.test.mjs.txt` },
      })
  return browsers.flatMap((browser) =>
    ['development', 'production'].flatMap((mode) =>
      scenarios.map((scenario) => ({
        ...scenario,
        browser,
        mode,
        label: `${browser}-${mode}-${scenario.group}`,
        representative: representative[mode].has(scenario.group),
      }))
    )
  )
}

function assertConcurrency(actual, profile) {
  const rows = actual.rows.map((row) => row.value)
  const phase = (name) => rows.filter((row) => row.phase === name)
  const failure = profile.group.endsWith('failure')
  assert.equal(actual.cases.length, 2)
  assert.deepEqual(
    actual.cases.map((test) => test.status),
    failure ? ['failed', 'passed'] : ['passed', 'passed']
  )
  assert.deepEqual(
    actual.cases.map((test) => test.failureMessages),
    failure ? [[`original ${profile.kind} concurrent failure`], []] : [[], []]
  )
  assert.equal(actual.success, !failure)
  if (profile.kind === 'limits') {
    assert.equal(phase('start').length, 2)
    assert.equal(phase('end').length, 2)
    assert(rows.every((row) => row.active.length <= profile.limit))
    assert.equal(Math.max(...rows.map((row) => row.peak)), profile.limit)
    return
  }
  const phases = rows.map((row) => row.phase)
  const concurrent = profile.scheduling !== 'serial'
  assert.equal(
    phases.indexOf('B-start') <
      phases.indexOf(profile.kind === 'plain' ? 'A-resumed' : 'A-end'),
    concurrent
  )
  assert.equal(
    Math.max(
      ...rows.filter((row) => 'active' in row).map((row) => row.active.length)
    ),
    concurrent ? 2 : 1
  )
  if (profile.kind === 'plain') {
    assert.equal(phase('A-resumed')[0].self, 'plain A')
    assert.equal(phase('B-end')[0].self, 'plain B')
  } else {
    assert.equal(phase('A-end')[0].clicksA, 1)
    assert.equal(phase('A-end')[0].clicksB, concurrent ? 1 : 0)
    assert.equal(phase('B-native-done')[0].clicksB, 1)
    assert.equal(phase('B-end')[0].clicksA, 1)
    assert.equal(phase('B-end')[0].clicksB, 1)
  }
}

function promiseProfiles(browsers) {
  return browsers.flatMap((browser) =>
    ['development', 'production'].flatMap((mode) =>
      ['cooperate', 'native-resolve', 'retained', 'after-all'].map((group) => ({
        browser,
        mode,
        group,
        label: `${browser}-${mode}-${group}`,
        source: { path: group + '.test.mjs.txt' },
      }))
    )
  )
}

function assertPromiseCalls(actual, profile) {
  assert.equal(actual.success, true)
  assert.equal(actual.cases.length, profile.group === 'retained' ? 2 : 1)
  assert(
    actual.cases.every(
      (test) => test.status === 'passed' && test.failureMessages.length === 0
    )
  )
  const rows = actual.rows
  if (profile.group === 'native-resolve') {
    const row = rows[0]
    assert.equal(rows.length, 1)
    assert.equal(row.clicks, 1)
    for (const key of ['same', 'native']) assert.equal(row[key], true, key)
    return
  }
  const phases = rows.map((row) => row.phase)
  if (profile.group === 'cooperate') {
    assert.deepEqual(phases, ['released', 'complete'])
    assert.equal(rows[1].clicks, 1)
  } else if (profile.group === 'retained') {
    assert.deepEqual(phases, [
      'created',
      'public-query',
      'retained-consumed',
      'new-call',
    ])
    assert.equal(rows[0].clicks, 0)
    assert.equal(rows[1].count, 1)
    assert.equal(rows[1].text, 'Retained serial target')
    assert.equal(rows[2].clicks, 1)
    assert.equal(rows[3].clicks, 2)
  } else {
    assert.deepEqual(phases, [
      'body-ended',
      'after-all-created',
      'settled',
      'after-all-done',
    ])
    assert.equal(rows[0].clicks, 0)
    assert.equal(rows[2].clicks, 1)
    assert.equal(rows[3].clicks, 1)
  }
}
