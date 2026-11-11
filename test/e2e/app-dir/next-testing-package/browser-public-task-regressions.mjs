import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../../lib/next-testing-case-runner.mjs'
import { resolveFixturePath } from '../../../lib/next-testing-fixtures.cjs'

const queueGroups = [
  'identity',
  'native-fields',
  'queue-accessor-iterator',
  'queue-mixed-release',
  'queue-retry-retention',
  'finished-shared-array',
  'registration-getters',
  'retained-late-registration',
  'retry-registrar',
  'failed-shared-array',
  'failed-getters',
  'failed-retained-late',
  'failed-retry-reset',
  'failed-registration-stack',
]

function outputRows(report, prefix) {
  return report.next.events
    .filter((event) => event.type === 'output')
    .flatMap((event) => event.text.split('\n'))
    .filter((line) => line.startsWith(prefix))
    .flatMap((line) => JSON.parse(line.slice(prefix.length)))
}

export function assertQueueBehavior(group, report) {
  const prefix =
    group === 'identity'
      ? 'TASK_BROWSER_IDENTITY:'
      : group === 'native-fields'
        ? 'TASK_NATIVE_PROMISES:'
        : 'TASK_QUEUE_CONSUMER:'
  const rows = outputRows(report, prefix)
  const cases = report.testResults.flatMap((file) => file.assertionResults)
  const failed = [
    'failed-shared-array',
    'failed-getters',
    'failed-registration-stack',
  ].includes(group)
  const historicalFailure = {
    'queue-retry-retention': 'manual first',
    'retry-registrar': 'first actual retry',
    'failed-retry-reset': 'actual controlled body failure',
  }[group]
  assert.equal(
    cases.length,
    group === 'native-fields' ? 4 : group.includes('retained-late') ? 2 : 1
  )
  assert.equal(report.success, !failed)
  assert.equal(
    report.next.summary.errors,
    Number(failed || Boolean(historicalFailure))
  )
  assert(
    !report.next.events.some(
      (event) =>
        event.type === 'diagnostic' && event.diagnostic.severity === 'error'
    )
  )
  for (const test of cases) {
    assert.equal(test.status, failed ? 'failed' : 'passed')
    assert.deepEqual(
      test.failureMessages,
      failed
        ? ['actual controlled body failure']
        : historicalFailure
          ? [historicalFailure]
          : []
    )
  }
  const stages = rows.map((row) => row.stage)
  const at = (stage) => {
    const found = rows.find((row) => row.stage === stage)
    assert(found, `Missing ${group} stage: ${stage}`)
    return found
  }
  const all = (stage) => rows.filter((row) => row.stage === stage)
  const before = (first, second) =>
    assert(
      stages.indexOf(first) >= 0 &&
        stages.indexOf(second) > stages.indexOf(first),
      `${first} must precede ${second}`
    )
  const identity = (values) =>
    values.forEach((row) => {
      if ('same' in row) assert.equal(row.same, true)
      if ('receiverUndefined' in row) assert.equal(row.receiverUndefined, true)
      if ('args' in row) assert.equal(row.args, 1)
    })
  assert(!stages.some((stage) => stage.startsWith('unexpected')))
  switch (group) {
    case 'identity':
      assert.deepEqual(stages, [
        'beforeEach',
        'body',
        'awaited',
        'afterEach',
        'finished',
      ])
      break
    case 'native-fields': {
      for (const name of ['native fulfilled field', 'native rejected field']) {
        const operation = rows.filter((row) => row.name === name)
        assert.deepEqual(
          operation.map((row) => row.stage),
          ['before', 'created', 'awaited', 'afterEach']
        )
        assert.equal(operation[0].promises, null)
        assert.equal(operation[1].promises.length, 1)
        assert.equal(operation[2].promises.length, 0)
        assert.equal(operation[2].sameQueue, true)
      }
      const reassigned = rows.filter(
        (row) =>
          row.name === 'public queue reassignment preserves actual operation'
      )
      assert.equal(reassigned.length, 3)
      for (const row of reassigned.slice(0, 2)) {
        assert.equal(row.oldLength, 1)
        assert.equal(row.oldNativeIdentity, true)
      }
      const custom = rows.filter(
        (row) => row.name === 'plain custom matcher keeps native field absent'
      )
      assert.equal(custom.length, 4)
      assert(custom.every((row) => row.promises === null))
      break
    }
    case 'queue-accessor-iterator':
      before('body-return', 'queue-get')
      before('iterator-call', 'then-call')
      before('then-call', 'afterEach')
      assert.deepEqual(
        all('queue-get').map((row) => row.read),
        [1, 2]
      )
      assert.equal(at('iterator-call').sameThis, true)
      assert.equal(at('then-call').sameThis, true)
      assert.equal(at('then-call').args, 2)
      break
    case 'queue-mixed-release':
      assert.deepEqual(stages, [
        'body-return',
        'manual-then',
        'release-native',
        'native-settled',
        'afterEach',
      ])
      assert.equal(at('body-return').length, 2)
      break
    case 'queue-retry-retention':
      assert.deepEqual(
        all('body').map((row) => row.attempt),
        [1, 2]
      )
      assert(all('body').every((row) => row.same))
      assert.deepEqual(
        all('manual-then').map((row) => row.attempt),
        [1, 2]
      )
      break
    case 'finished-shared-array':
    case 'failed-shared-array': {
      const suffix = group.startsWith('failed') ? 'failed' : 'finished'
      assert.equal(at('initial').absent, true)
      assert.equal(at('body-return').same, true)
      assert.equal(at('body-return').length, 3)
      const callbacks = rows.filter((row) => row.stage.endsWith('-' + suffix))
      assert.deepEqual(
        callbacks.map((row) => row.stage),
        ['manual-' + suffix, 'global-' + suffix, 'context-' + suffix]
      )
      identity(callbacks)
      assert.equal(rows.at(-1).absent, true)
      break
    }
    case 'registration-getters':
      assert.equal(at('body-return').length, 2)
      assert(all('finished-get').length > 0)
      before('global-finished', 'context-finished')
      identity([at('global-finished'), at('context-finished')])
      assert.equal(at('finished-set').absent, true)
      assert.equal(at('final-task').absent, true)
      break
    case 'retained-late-registration':
    case 'failed-retained-late':
      assert.equal(at('before-retained').absent, true)
      assert.equal(at('after-retained').firstArray, true)
      assert.equal(at('after-retained').firstLength, 1)
      assert.equal(at('after-retained').currentAbsent, true)
      before('first-body', 'after-retained')
      break
    case 'retry-registrar':
      assert.deepEqual(
        all('body-start').map((row) => row.attempt),
        [1, 2]
      )
      assert(
        all('body-start').every(
          (row) => row.sameTask && row.sameContext && row.absent
        )
      )
      assert.deepEqual(
        all('finished').map((row) => row.attempt),
        [1, 2]
      )
      assert(all('finished').every((row) => row.same && !row.aborted))
      break
    case 'failed-getters':
      assert.equal(at('body-return').length, 2)
      before('global-failed', 'context-failed')
      assert.equal(at('failed-set').absent, true)
      assert.equal(at('finished-set').absent, true)
      assert.equal(at('final-task').failedAbsent, true)
      assert.equal(at('final-task').finishedAbsent, true)
      break
    case 'failed-retry-reset':
      assert.deepEqual(
        all('body-start').map((row) => row.attempt),
        [1, 2]
      )
      assert(all('body-start').every((row) => row.same && row.absent))
      assert.equal(all('failed-callback').length, 1)
      assert.equal(at('failed-callback').attempt, 1)
      assert.equal(at('failed-callback').same, true)
      assert.equal(at('final-task').absent, true)
      break
    case 'failed-registration-stack':
      assert.equal(at('first-failed').receiverUndefined, true)
      assert.equal(at('appended').length, 4)
      assert.deepEqual(
        all('live-refused').map((row) => row.name),
        ['onTestFinished', 'onTestFailed']
      )
      for (const row of all('live-refused'))
        assert.equal(
          row.message,
          `Cannot call "${row.name}" inside a test hook.`
        )
      assert.equal(at('final-task').absent, true)
      break
    default:
      assert.fail('Unknown queue scenario: ' + group)
  }
  return {
    cases: cases.length,
    rows: rows.length,
    expectedExit: failed ? 1 : 0,
  }
}

export function assertZeroBehavior(group, report) {
  const rows = outputRows(
    report,
    group === 'genuine' ? 'TASK_ZERO_BODY:' : 'ZERO_NATIVE_GUARD:'
  )
  const cases = report.testResults.flatMap((file) => file.assertionResults)
  assert.equal(report.success, true)
  assert.equal(report.next.summary.errors, Number(group === 'genuine'))
  assert(
    !report.next.events.some(
      (event) =>
        event.type === 'diagnostic' && event.diagnostic.severity === 'error'
    )
  )
  assert.equal(cases.length, group === 'genuine' ? 3 : 1)
  assert(cases.every((test) => test.status === 'passed'))
  if (group === 'genuine') {
    assert.deepEqual(cases[0].failureMessages, [
      'zero body synchronous retry control',
    ])
    assert(cases.slice(1).every((test) => test.failureMessages.length === 0))
    assert.deepEqual(
      rows
        .filter((row) => row.stage === 'retry-body')
        .map((row) => row.attempt),
      [1, 2]
    )
    assert.equal(rows.filter((row) => row.stage === 'retry-finished').length, 1)
    assert.equal(rows.find((row) => row.stage === 'queue-finished').reads, 2)
    const stages = rows.map((row) => row.stage)
    assert(
      stages.indexOf('queue-body') >= 0 &&
        stages.indexOf('queue-finished') > stages.indexOf('queue-body')
    )
    assert(
      stages.indexOf('return-body') >= 0 &&
        stages.indexOf('body-then-get') > stages.indexOf('return-body')
    )
  } else {
    assert(cases.every((test) => test.failureMessages.length === 0))
    assert.deepEqual(
      rows.map((row) => row.stage),
      ['body', 'queue-get', 'queue-get', 'finished']
    )
    assert.deepEqual(
      rows.filter((row) => row.stage === 'queue-get').map((row) => row.reads),
      [1, 2]
    )
  }
  return { cases: cases.length, rows: rows.length, expectedExit: 0 }
}

export async function runBrowserTaskRegressions(kind) {
  const [consumerArg, outputArg, enginesArg = 'chromium,firefox', onlyGroup] =
    process.argv.slice(2)
  assert(
    consumerArg && outputArg,
    'Expected installed consumer and output directory'
  )
  const consumer = fs.realpathSync(consumerArg),
    output = path.resolve(outputArg)
  const engines = enginesArg.split(',')
  assert(
    engines.length &&
      new Set(engines).size === engines.length &&
      engines.every((engine) =>
        ['chromium', 'firefox', 'webkit'].includes(engine)
      )
  )
  const groups = kind === 'queues' ? queueGroups : ['genuine', 'context']
  if (onlyGroup) assert(groups.includes(onlyGroup))
  const corpus = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    kind === 'queues' ? 'browser-public-task-queues' : 'browser-zero-forwarding'
  )
  fs.mkdirSync(output)
  const facts = []
  for (const browser of engines)
    for (const mode of ['development', 'production'])
      for (const group of groups) {
        if (onlyGroup && onlyGroup !== group) continue
        const source =
          kind === 'queues'
            ? group + '.test.mjs.txt'
            : group === 'genuine'
              ? 'zero.test.mjs.txt'
              : 'native-guard.test.mjs.txt'
        const expectedExit = [
          'failed-shared-array',
          'failed-getters',
          'failed-registration-stack',
        ].includes(group)
          ? 1
          : 0
        await runCompilerCase({
          repo: consumer,
          output: path.join(output, `${browser}-${mode}-${group}`),
          mode,
          files: [
            {
              target: 'task.test.mjs',
              bytes: fs.readFileSync(
                resolveFixturePath(path.join(corpus, 'sources', source))
              ),
            },
          ],
          expectedExit,
          config: {
            maxWorkers: 1,
            projects: [
              {
                name: 'browser-public-task',
                environment: 'browser',
                mode,
                browser: {
                  enabled: true,
                  headless: true,
                  instances: [{ browser }],
                },
                include: ['task.test.mjs'],
                testTimeout: 1000,
                hookTimeout: 1000,
                includeTaskLocation: false,
              },
            ],
          },
          checkOutcomes(report) {
            assert.deepEqual(
              report.testResults.map((file) => path.basename(file.name)),
              ['task.test.mjs']
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
            const result =
              kind === 'queues'
                ? assertQueueBehavior(group, report)
                : assertZeroBehavior(group, report)
            assert.equal(result.expectedExit, expectedExit)
            facts.push({
              browser,
              mode,
              group,
              cases: result.cases,
              rows: result.rows,
            })
          },
        })
      }
  fs.writeFileSync(
    path.join(output, 'verified.json'),
    JSON.stringify(
      {
        profiles: facts.length,
        cases: facts.reduce((count, fact) => count + fact.cases, 0),
        behaviorAssertions: true,
        allOwnersClosed: true,
        allInputsRemovedAfterOwnedReadersJoined: true,
        facts,
      },
      null,
      2
    ) + '\n'
  )
}
