import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
const [
  consumerArg,
  outputArg,
  enginesArg = 'chromium,firefox',
  selection = 'all',
] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Expected installed consumer and new evidence directory'
)
const consumer = fs.realpathSync(consumerArg),
  output = path.resolve(outputArg),
  corpus = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'browser-plain-fixtures'
  ),
  expected = JSON.parse(fs.readFileSync(path.join(corpus, 'reference.json'))),
  load = createRequire(path.join(consumer, 'package.json')),
  next = load.resolve('next/dist/bin/next'),
  engines = enginesArg.split(','),
  prepared = [],
  facts = []
assert(
  engines.length > 0 &&
    engines.every((e) => ['chromium', 'firefox'].includes(e)) &&
    new Set(engines).size === engines.length
)
for (const name of ['vitest', 'vite', '@vitest/mocker'])
  assert.throws(() => load.resolve(name))
const hash = (file) =>
    createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  save = (dir, name, value) =>
    fs.writeFileSync(
      path.join(dir, name),
      JSON.stringify(value, null, 2) + '\n'
    )
assert(['all', 'representative'].includes(selection))
const reporterSource =
  "import{appendFileSync,writeFileSync}from'node:fs'\nconst records=[],save=value=>{records.push(value);appendFileSync(process.env.CONCURRENCY_TRACE,JSON.stringify(value)+'\\n')}\nconst errors=values=>(values??[]).map(error=>({name:error.name,message:error.message,stack:error.stack??error.stackStr}))\nexport default class{onUserConsoleLog(log){save({hook:'console',log})}onTestCaseResult(test){const value=test.result();save({hook:'case',id:test.id,name:test.name,result:{state:value.state,errors:errors(value.errors)}})}onTestRunEnd(modules,unhandled,reason){const files=modules.map(module=>({id:module.id,name:module.name,state:module.state(),tests:[...module.children.allTests()].map(test=>({id:test.id,name:test.name,result:{state:test.result().state,errors:errors(test.result().errors)}}))}));save({hook:'end',reason,errors:errors(unhandled),files});writeFileSync(process.env.CONCURRENCY_TRACE+'.complete.json',JSON.stringify({records,reason,files,errors:errors(unhandled)},null,2)+'\\n')}}\n"
fs.mkdirSync(output)
for (const profile of expected.profiles.filter(
  (p) =>
    engines.includes(p.browser) && (selection === 'all' || p.representative)
)) {
  for (const entry of [
    ...profile.sources,
    profile.projected,
    profile.rawStandardReport,
    profile.rawCustomTrace,
  ])
    assert.equal(hash(path.join(corpus, entry.path)), entry.sha256)
  const fixture = fs.mkdtempSync(
      path.join(consumer, '.next-test-plain-fixtures-')
    ),
    destination = path.join(output, profile.label)
  fs.mkdirSync(destination)
  for (const input of profile.sources)
    fs.copyFileSync(
      path.join(corpus, input.path),
      path.join(fixture, input.filename)
    )
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    '{"type":"module","private":true}\n'
  )
  fs.symlinkSync(
    path.join(consumer, 'node_modules'),
    path.join(fixture, 'node_modules'),
    'dir'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify({
      maxWorkers: 1,
      projects: [
        {
          name: 'browser-plain-fixtures',
          environment: 'browser',
          mode: profile.mode,
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: profile.browser }],
          },
          include: profile.include,
          testTimeout: 5000,
          maxConcurrency: profile.limit,
          ...(profile.scheduling === 'configured'
            ? { sequence: { concurrent: true } }
            : {}),
          hookTimeout: 5000,
          includeTaskLocation: false,
        },
      ],
    }) + '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'concurrency-reporter.mjs'),
    reporterSource
  )
  prepared.push({
    profile,
    fixture,
    destination,
    started: false,
    joined: false,
  })
}
save(output, 'inputs.json', {
  reference: expected.reference,
  allInputsPreparedBeforeReaders: true,
  profiles: prepared.map((r) => r.profile),
})
try {
  for (const record of prepared) {
    const { profile, fixture, destination } = record,
      report = path.join(destination, 'report.raw.json'),
      env = {
        ...process.env,
        NODE_ENV: profile.mode,
        NEXT_TELEMETRY_DISABLED: '1',
        FORCE_COLOR: '0',
        CONCURRENCY_TRACE: path.join(destination, 'trace.raw.jsonl'),
      }
    for (const key of [
      'CI',
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    record.started = true
    const owner = await runOwnedNode(
      [
        next,
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--reporter=' + path.join(fixture, 'concurrency-reporter.mjs'),
        '--outputFile=' + report,
      ],
      {
        cwd: fixture,
        env,
        auditDir: path.join(destination, 'owners'),
        timeoutMs: 120000,
      }
    )
    save(destination, 'owner.json', owner)
    fs.writeFileSync(path.join(destination, 'stdout.log'), owner.stdout)
    fs.writeFileSync(path.join(destination, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, profile.label)
    record.joined = true
    const raw = JSON.parse(fs.readFileSync(report)),
      trace = JSON.parse(
        fs.readFileSync(path.join(destination, 'trace.raw.jsonl.complete.json'))
      ),
      ids = new Map(
        trace.files.flatMap((file) => [
          [file.id, '<file>'],
          ...file.tests.map((test) => [test.id, test.name]),
        ])
      ),
      prefix = 'BROWSER_FIXTURE:',
      actual = {
        rows: trace.records
          .filter((event) => event.hook === 'console')
          .flatMap((event) =>
            event.log.content
              .split('\n')
              .filter((line) => line.startsWith(prefix))
              .map((line) => ({
                value: JSON.parse(line.slice(prefix.length)),
                task: ids.get(event.log.taskId) ?? event.log.taskId,
              }))
          ),
        cases: raw.testResults
          .flatMap((file) => file.assertionResults)
          .map((test) => ({
            name: test.fullName,
            status: test.status,
            failureMessages: test.failureMessages,
          })),
        caseFinals: trace.records
          .filter((event) => event.hook === 'case')
          .map((event) => ({ name: event.name, state: event.result.state })),
        runFinals: trace.records
          .filter((event) => event.hook === 'end')
          .map((event) => ({
            reason: event.reason,
            errors: event.errors,
            files: event.files.map((file) => ({
              state: file.state,
              tests: file.tests.map((test) => ({
                name: test.name,
                state: test.result.state,
              })),
            })),
          })),
        success: raw.success,
        exit: owner.status,
      },
      reference = JSON.parse(
        fs.readFileSync(path.join(corpus, profile.projected.path))
      )
    save(destination, 'actual.json', actual)
    assert.deepEqual(actual.rows, reference.rows)
    assert.deepEqual(
      actual.cases.map(({ name, status }) => ({ name, status })),
      reference.cases.map(({ name, status }) => ({ name, status }))
    )
    assert.equal(actual.success, reference.success)
    assert.equal(actual.exit, reference.exit)
    assert.deepEqual(actual, reference)
    for (const input of profile.sources)
      assert.equal(hash(path.join(fixture, input.filename)), input.sha256)
    facts.push({
      browser: profile.browser,
      mode: profile.mode,
      group: profile.group,
      cases: actual.cases.length,
      authoredRowsExact: true,
      caseNamesStatusesExact: true,
      statusExitExact: true,
      allOwnersClosed: true,
    })
    save(output, 'checks.json', { facts })
    console.log(JSON.stringify(facts.at(-1)))
  }
} finally {
  for (const record of prepared)
    if (!record.started || record.joined)
      fs.rmSync(record.fixture, { recursive: true, force: true })
}
save(output, 'verified.json', {
  profiles: facts.length,
  cases: facts.reduce((n, r) => n + r.cases, 0),
  authoredRows: prepared.reduce(
    (n, r) =>
      n +
      JSON.parse(fs.readFileSync(path.join(corpus, r.profile.projected.path)))
        .rows.length,
    0
  ),
  fullAuthoredProjectionsExact: true,
  plainBrowserFixturesCLI: true,
  wholeCustomErrorOrReadyEqualityClaim: false,
  allOwnersClosed: true,
  allInputsRemovedAfterOwnedReadersJoined: true,
  rawGenuineReportsRetainedWithoutWholeReportEqualityClaim: true,
})
