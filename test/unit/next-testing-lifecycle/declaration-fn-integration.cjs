const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createHash } = require('node:crypto')

async function main() {
  const repo = path.resolve(__dirname, '../../..')
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    pathToFileURL(
      path.join(
        repo,
        'test/e2e/app-dir/next-testing-package/process-supervisor.mjs'
      )
    ).href
  )
  const inputs = path.join(__dirname, 'declaration-fn-records')
  const evidence = await fs.mkdtemp(
    path.join(require('node:os').tmpdir(), 'next-testing-declaration-fn-')
  )
  const results = []
  let success = false
  const selectedGroups =
    process.argv[2] === 'chai-nested-functions'
      ? [
          'task-context-chai-nested-chainables',
          'task-context-chai-nested-function-receivers',
          'task-context-chai-nested-raw-alias',
        ]
      : process.argv[2] === 'hard-builtins'
        ? [
            'task-context-late-hard-builtins',
            'task-context-hard-builtin-receivers',
          ]
        : process.argv[2] === 'actual-task-flags'
          ? ['task-context-late-source-flags', 'task-context-actual-task-async']
          : process.argv[2] === 'id-publication'
            ? ['task-context-id-publication', 'task-context-id-suite']
            : process.argv[2] === 'transfer-hard'
              ? [
                  'task-context-transfer-effects',
                  'task-context-transfer-plain',
                  'task-context-transfer-setters',
                  'task-context-transfer-invocations',
                ]
              : process.argv[2] === 'native-return'
                ? [
                    'task-context-owned-getter-builtin-chain',
                    'task-context-owned-getter-native-calls',
                    'task-context-owned-getter-native-properties',
                  ]
                : process.argv[2] === 'own-property'
                  ? [
                      'task-context-owned-properties',
                      'task-context-owned-getter-view',
                      'task-context-owned-function-receivers',
                      'task-context-owned-getter-capture',
                      'task-context-owned-getter-returned-chain',
                    ]
                  : process.argv[2] === 'custom-owner'
                    ? [
                        'task-context-late-builtin-overrides',
                        'task-context-custom-task-state',
                        'task-context-custom-unawaited',
                        'task-context-custom-prepared',
                        'task-context-readonly-own-native-get',
                        'task-context-readonly-own-method',
                        'task-context-custom-assertion-view',
                      ]
                    : process.argv[2] === 'throw-builtins'
                      ? [
                          'task-context-late-throw-builtins',
                          'task-context-throw-builtin-receivers',
                          'task-context-throw-callbacks',
                        ]
                      : process.argv[2] === 'chai-fluent'
                        ? [
                            'task-context-chai-hard-fluent',
                            'task-context-chai-fluent-receivers',
                            'task-context-chai-fluent-callbacks',
                          ]
                        : process.argv[2] === 'chai-chainable-functions'
                          ? [
                              'task-context-chai-chainable-functions',
                              'task-context-chai-chainable-function-receivers',
                              'task-context-chai-chainable-raw-alias',
                            ]
                          : undefined
  async function prepareFixture(mode, group) {
    const fixture = await fs.mkdtemp(
      path.join(repo, '.next-test-declaration-fn-')
    )
    const names =
      group === 'retention'
        ? ['helpers.case.mjs', 'realm.case.mjs', 'realm-cache.mjs']
        : group === 'task-context-handled' || group === 'task-context-late'
          ? ['task-context-deadline-late.case.mjs']
          : [`${group}.case.mjs`]
    const sources = await Promise.all(
      names.map((name) => fs.readFile(path.join(inputs, `${name}.txt`)))
    )
    for (let index = 0; index < names.length; index++)
      await fs.writeFile(path.join(fixture, names[index]), sources[index])
    await fs.writeFile(
      path.join(fixture, 'package.json'),
      '{"type":"module"}\n'
    )
    await fs.symlink(
      path.join(repo, 'node_modules'),
      path.join(fixture, 'node_modules'),
      'dir'
    )
    await fs.writeFile(
      path.join(fixture, 'next.config.mjs'),
      `export default ${JSON.stringify({ turbopack: { root: repo } })}\n`
    )
    await fs.writeFile(
      path.join(fixture, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 1,
        projects: [
          {
            name: `fn-${group}`,
            mode,
            environment: 'node',
            include: names.filter((name) => name.endsWith('.case.mjs')),
            allowOnly: true,
            ...(group.startsWith('task-context-chai-nested-')
              ? { testTimeout: 500, hookTimeout: 1000 }
              : {}),
            ...(group === 'task-context-handled'
              ? { testNamePattern: 'old-rejection$' }
              : {}),
          },
        ],
      })
    )
    return { fixture, names, sources, started: false, joined: false }
  }
  const groups = selectedGroups ?? [
    'contract',
    'focus',
    'retention',
    'suite-collector',
    'suite-queue',
    'task-scope',
    'task-publish',
    'task-context',
    'task-context-positive',
    'task-context-signals',
    'task-context-handled',
    'task-context-late-active',
    'task-context-late-closed',
    'task-context-late-foreign',
    'task-context-late-hard-chain',
    'task-context-late',
    'task-context-precreated-chain',
    'task-context-precreated-receivers',
    'task-context-precreated-foreign',
    'task-context-late-deep',
    'task-context-late-equality-testers',
    'task-context-deep-foreign-receivers',
  ]
  async function runMode(mode, preparedFixtures, laneGroups = groups) {
    const modeResults = []
    for (const group of laneGroups) {
      const prepared =
        preparedFixtures?.get(group) ?? (await prepareFixture(mode, group))
      const { fixture, names, sources } = prepared
      let joined = false
      try {
        const out = path.join(evidence, `${mode}-${group}`)
        await fs.mkdir(out)
        const reportFile = path.join(out, 'report.json')
        const env = {
          ...process.env,
          NODE_ENV: mode,
          NEXT_TELEMETRY_DISABLED: '1',
          FORCE_COLOR: '0',
        }
        for (const key of [
          'CI',
          'NODE_OPTIONS',
          'NODE_PATH',
          'NEXT_TEST_NATIVE_DIR',
          'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
        ])
          delete env[key]
        prepared.started = true
        const owner = await runOwnedNode(
          [
            path.join(repo, 'packages/next/dist/bin/next'),
            'test',
            fixture,
            '--run',
            '--reporter=json',
            `--outputFile=${reportFile}`,
          ],
          {
            cwd: fixture,
            env,
            timeoutMs: 120000,
            auditDir: path.join(out, 'processes'),
          }
        )
        await fs.writeFile(path.join(out, 'owner.json'), JSON.stringify(owner))
        assertOwnedNodeCompleted(owner, `declaration fn ${mode}/${group}`)
        joined = true
        prepared.joined = true
        const report = JSON.parse(await fs.readFile(reportFile, 'utf8'))
        const rows = report.next.events
          .filter((e) => e.type === 'output')
          .flatMap((e) =>
            e.text
              .split('\n')
              .filter((s) => s.startsWith('DECLARATION_FN:'))
              .map((s) => ({
                stream: e.stream,
                prefix: 'DECLARATION_FN',
                value: JSON.parse(s.slice(15)),
              }))
          )
        const cases = report.testResults
          .flatMap((f) => f.assertionResults)
          .map((c) => ({
            name: c.fullName,
            status: c.status,
            failureMessages: c.failureMessages,
          }))
        const counts = Object.fromEntries(
          [
            'numTotalTests',
            'numPassedTests',
            'numFailedTests',
            'numPendingTests',
            'numTodoTests',
            'success',
          ].map((k) => [k, report[k]])
        )
        // Independent file delivery order is not an authoring contract. Retain
        // every authored row and complete case outcome from both file realms.
        if (group === 'retention') {
          rows.sort((a, b) => a.value.kind.localeCompare(b.value.kind))
          cases.sort((a, b) => a.name.localeCompare(b.name))
        }
        const actual = { rows, cases, counts, exit: owner.status }
        // Retry failures retain full native stack strings in the raw report.
        // Compare every authored row and outcome without pretending engine
        // internals and temporary fixture paths are portable golden strings.
        let comparable = actual
        if (group === 'task-context-signals') {
          assert.equal(cases[0].failureMessages.length, 1)
          assert.match(
            cases[0].failureMessages[0],
            /^AssertionError: expected \+0 to be 1 \/\/ Object.is equality\n/
          )
          assert.match(
            cases[0].failureMessages[0],
            /task-context-signals\.case\.mjs:7:72/
          )
          assert.equal(cases[1].failureMessages.length, 1)
          assert.match(
            cases[1].failureMessages[0],
            /^Error: Test timed out in 100ms\.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout"\./
          )
          comparable = {
            ...actual,
            cases: cases.map(({ name, status, failureMessages }) => ({
              name,
              status,
              failureCount: failureMessages.length,
            })),
          }
        }
        if (group === 'task-context-handled') {
          assert.equal(cases[0].failureMessages.length, 1)
          assert.match(
            cases[0].failureMessages[0],
            /^Error: Test timed out in 60ms\.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout"\./
          )
          assert.match(
            cases[0].failureMessages[0],
            /task-context-deadline-late\.case\.mjs:3:51/
          )
          assert.match(
            cases[0].failureMessages[0],
            /task-context-deadline-late\.case\.mjs:5:1/
          )
          comparable = {
            ...actual,
            cases: cases.map(({ name, status, failureMessages }) => ({
              name,
              status,
              failureCount: failureMessages.length,
            })),
          }
        }
        if (
          group.startsWith('task-context-late') ||
          group.startsWith('task-context-precreated') ||
          group.startsWith('task-context-deep')
        ) {
          for (const { failureMessages } of cases)
            for (const failure of failureMessages)
              assert.ok(failure.includes(`${names[0]}:`))
          comparable = {
            ...actual,
            cases: cases.map(({ name, status, failureMessages }) => ({
              name,
              status,
              failureCount: failureMessages.length,
              failureHeaders: failureMessages.map((failure) =>
                failure.split('\n').slice(0, 2).join('\n')
              ),
            })),
          }
        }
        if (
          group === 'task-context-late-builtin-overrides' ||
          group.startsWith('task-context-custom-') ||
          group.startsWith('task-context-readonly-') ||
          group.startsWith('task-context-owned-')
        ) {
          for (const { failureMessages } of cases)
            for (const failure of failureMessages)
              assert.ok(failure.includes(`${names[0]}:`))
          comparable = {
            ...actual,
            cases: cases.map(({ name, status, failureMessages }) => ({
              name,
              status,
              failureCount: failureMessages.length,
              failureHeads: failureMessages.map(
                (failure) => failure.split('\n')[0]
              ),
            })),
          }
        }
        if (group === 'task-context-custom-unawaited') {
          const diagnostics = report.next.events.filter(
            (event) => event.type === 'diagnostic'
          )
          assert.equal(diagnostics.length, 1)
          assert.equal(diagnostics[0].diagnostic.phase, 'runtime')
          assert.equal(
            diagnostics[0].diagnostic.message,
            'real unawaited custom mismatch'
          )
          assert.equal(report.next.summary.errors, 1)
          assert.equal(report.next.summary.status, 'failed')
          assert.ok(
            report.next.events
              .filter((event) => event.type === 'suite-end')
              .every((event) => event.errors.length === 0)
          )
        }
        if (group === 'task-context-actual-task-async') {
          for (const { failureMessages } of cases)
            for (const failure of failureMessages)
              assert.ok(failure.includes(`${names[0]}:`))
          comparable = {
            ...actual,
            cases: cases.map(({ name, status, failureMessages }) => ({
              name,
              status,
              failureCount: failureMessages.length,
              failureHeads: failureMessages.map(
                (failure) => failure.split('\n')[0]
              ),
            })),
          }
        }
        assert.deepEqual(
          comparable,
          JSON.parse(
            await fs.readFile(
              path.join(inputs, `pristine-${group}.json`),
              'utf8'
            )
          )
        )
        for (let index = 0; index < names.length; index++)
          assert.deepEqual(
            await fs.readFile(path.join(fixture, names[index])),
            sources[index]
          )
        modeResults.push({
          mode,
          group,
          cases: cases.length,
          rows: rows.length,
          sourceSHA256: sources.map((source) =>
            createHash('sha256').update(source).digest('hex')
          ),
        })
      } finally {
        if (joined && !preparedFixtures)
          await fs.rm(fixture, { recursive: true, force: true })
      }
    }
    return modeResults
  }
  try {
    if (
      process.argv[2] === undefined ||
      process.argv[2] === 'custom-owner' ||
      process.argv[2] === 'transfer-hard' ||
      process.argv[2] === 'id-publication' ||
      process.argv[2] === 'actual-task-flags' ||
      process.argv[2] === 'hard-builtins' ||
      process.argv[2] === 'throw-builtins' ||
      process.argv[2] === 'chai-fluent' ||
      process.argv[2] === 'chai-chainable-functions' ||
      process.argv[2] === 'chai-nested-functions'
    ) {
      // Prepare both lanes before either compiler starts. Their authored inputs
      // stay fixed while each profile owns its fixture, build and audit output.
      const preparedByMode = new Map()
      const prepared = []
      try {
        for (const mode of ['development', 'production']) {
          const fixtures = new Map()
          preparedByMode.set(mode, fixtures)
          for (const group of groups) {
            const fixture = await prepareFixture(mode, group)
            fixtures.set(group, fixture)
            prepared.push(fixture)
          }
        }
        const modeGroups =
          process.argv[2] === undefined
            ? [
                groups.filter((_, index) => index % 2 === 0),
                groups.filter((_, index) => index % 2 === 1),
              ]
            : [groups]
        const lanes = await Promise.allSettled(
          ['development', 'production'].flatMap((mode) =>
            modeGroups.map((laneGroups) =>
              runMode(mode, preparedByMode.get(mode), laneGroups)
            )
          )
        )
        const failures = lanes.filter((lane) => lane.status === 'rejected')
        if (failures.length)
          throw new AggregateError(
            failures.map((lane) => lane.reason),
            process.argv[2] === 'custom-owner'
              ? 'Custom matcher declaration lanes failed'
              : process.argv[2] === 'transfer-hard'
                ? 'Transfer matcher declaration lanes failed'
                : process.argv[2] === 'id-publication'
                  ? 'Task ID publication lanes failed'
                  : process.argv[2] === 'actual-task-flags'
                    ? 'Actual Task flag declaration lanes failed'
                    : process.argv[2] === 'hard-builtins'
                      ? 'Hard builtin declaration lanes failed'
                      : process.argv[2] === 'throw-builtins'
                        ? 'Throw builtin declaration lanes failed'
                        : process.argv[2] === 'chai-fluent'
                          ? 'Fluent Chai declaration lanes failed'
                          : process.argv[2] === 'chai-chainable-functions'
                            ? 'Native Chai chainable declaration lanes failed'
                            : 'Default declaration lanes failed'
          )
        // Completion order does not change the original public result order.
        if (process.argv[2] === undefined) {
          const profiles = new Map(
            lanes.flatMap((lane) =>
              lane.value.map((profile) => [
                `${profile.mode}/${profile.group}`,
                profile,
              ])
            )
          )
          for (const mode of ['development', 'production'])
            for (const group of groups) {
              const profile = profiles.get(`${mode}/${group}`)
              if (!profile)
                throw new Error('Missing default declaration profile')
              results.push(profile)
            }
        } else {
          for (const lane of lanes) results.push(...lane.value)
        }
      } finally {
        // Every started lane has joined before source removal. Keep any fixture
        // whose original ownership check failed available with its evidence.
        await Promise.all(
          prepared
            .filter((fixture) => !fixture.started || fixture.joined)
            .map(({ fixture }) =>
              fs.rm(fixture, { recursive: true, force: true })
            )
        )
      }
    } else {
      for (const mode of ['development', 'production'])
        results.push(...(await runMode(mode)))
    }
    success = true
    process.stdout.write(JSON.stringify({ profiles: results }) + '\n')
  } finally {
    if (success) await fs.rm(evidence, { recursive: true, force: true })
    else console.error(`Retained declaration fn evidence: ${evidence}`)
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
