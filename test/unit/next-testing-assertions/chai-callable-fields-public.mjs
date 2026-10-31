import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [lane, project, output, mode, extension = 'mjs', family = 'default'] =
  process.argv.slice(2)
assert(['source', 'installed'].includes(lane))
assert(['development', 'production'].includes(mode))
assert(['js', 'mjs'].includes(extension))
assert(['default', 'disabled'].includes(family))
assert(project && output && !existsSync(output))
mkdirSync(output, { recursive: true })
const here = dirname(fileURLToPath(import.meta.url))
const inputs = join(here, 'fixtures/chai-callable-fields', family)
const model = JSON.parse(readFileSync(join(inputs, 'reference.json'), 'utf8'))
const body = readFileSync(join(inputs, model.source), 'utf8')
const sha = (value) => createHash('sha256').update(value).digest('hex')
assert.equal(sha(body), model.bodySHA256)
const req = createRequire(join(project, 'package.json'))
const next = dirname(req.resolve('next/package.json'))
const fixture = join(project, '.next-test-chai-name-' + randomUUID())
const entry = 'probe.test.' + extension
const save = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n')
const trace = join(output, 'trace.jsonl'),
  rawErrors = join(output, 'raw-errors.jsonl'),
  caseErrors = join(output, 'case-errors.jsonl')
for (const file of [trace, rawErrors, caseErrors]) writeFileSync(file, '')
const reporter = `import{appendFileSync}from'node:fs'\nexport default class Observer{onUserConsoleLog(log){for(const line of log.content.split('\\n')){if(line.startsWith('POLL_OWNERSHIP_ROW '))appendFileSync(${JSON.stringify(trace)},line.slice(19)+'\\n');else if(line.startsWith('POLL_OWNERSHIP_ERROR '))appendFileSync(${JSON.stringify(rawErrors)},line.slice(21)+'\\n')}}onTestCaseResult(test){appendFileSync(${JSON.stringify(caseErrors)},JSON.stringify({name:test.name,result:test.result()})+'\\n')}}\n`
const config = `export default{test:{mode:${JSON.stringify(mode)},include:[${JSON.stringify(entry)}],fileParallelism:false,maxWorkers:1,cache:false,testTimeout:5000,hookTimeout:5000}}\n`
const argv = [
  join(next, 'dist/bin/next'),
  'test',
  fixture,
  '--reporter=json',
  '--reporter=' + join(fixture, 'reporter.mjs'),
  '--outputFile=' + join(output, 'cases.json'),
]
const pins = Object.fromEntries(
  [
    join(next, 'dist/experimental/testing/assertions/index.js'),
    join(next, 'dist/experimental/testing/runner/index.js'),
    join(next, 'dist/bin/next'),
  ].map((file) => [file, sha(readFileSync(file))])
)
let result
try {
  mkdirSync(fixture)
  writeFileSync(
    join(fixture, 'package.json'),
    JSON.stringify({ private: true, type: 'module' })
  )
  writeFileSync(join(fixture, entry), body)
  writeFileSync(join(fixture, 'reporter.mjs'), reporter)
  writeFileSync(join(fixture, 'vitest.config.mjs'), config)
  save('AUTHORED.json', {
    lane,
    mode,
    extension,
    body,
    bodySHA256: model.bodySHA256,
    config,
    reporter,
    argv,
    fixture,
    bounds: { cli: 120000, test: 5000, hook: 5000 },
  })
  save('PINS-BEFORE.json', pins)
  result = await runOwnedNode(argv, {
    cwd: project,
    env: {
      ...process.env,
      NODE_ENV: mode,
      CI: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    timeoutMs: 120000,
    auditDir: join(output, 'owners'),
  })
  save('RESULT.json', result)
  writeFileSync(join(output, 'stdout.log'), result.stdout)
  writeFileSync(join(output, 'stderr.log'), result.stderr)
  assertOwnedNodeCompleted(result, 'public Chai callable own descriptors')
  const lines = (file) =>
    readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  const rows = lines(trace),
    errors = lines(rawErrors),
    rawCases = lines(caseErrors)
  save('RAW-CASE-RESULTS.json', rawCases)
  const caseCallbacks = rawCases.map((value) => ({
    name: value.name,
    state: value.result.state,
  }))
  const report = JSON.parse(readFileSync(join(output, 'cases.json'), 'utf8'))
  const cases = report.testResults.flatMap((file) =>
    file.assertionResults.map((value) => ({
      name: value.fullName,
      state: value.status,
    }))
  )
  const summary = Object.fromEntries(
    Object.keys(model.summary).map((key) => [key, report[key]])
  )
  assert.equal(result.status, 0)
  assert.deepEqual(rows, model.rows)
  assert.deepEqual(cases, model.cases)
  assert.deepEqual(caseCallbacks, model.caseCallbacks ?? model.cases)
  assert.deepEqual(summary, model.summary)
  assert.equal(rawCases.length, report.numTotalTests)
  assert.equal(errors.length, model.rawErrorCount)
  for (const [file, hash] of Object.entries(pins))
    assert.equal(sha(readFileSync(file)), hash, file)
  assert.equal(sha(readFileSync(join(fixture, entry))), model.bodySHA256)
  save('PINS-AFTER.json', pins)
  save('VERIFIED.json', {
    lane,
    mode,
    extension,
    rows,
    cases,
    caseCallbacks,
    summary,
    rawErrorCount: errors.length,
    exactGenuineAuthorRows: true,
    exactCaseStatesAndStandardCounts: true,
    rawErrorFrameParity:
      'open; complete raw reports and authored error stacks retained',
    asyncPluginAndPostDisposalInvocationParity:
      'open; no forced settlement or fabricated task facts',
    originalBoundsHeld: true,
    allOwnersJoined: true,
    node: { execPath: process.execPath, versions: process.versions },
  })
  console.log(
    JSON.stringify({
      lane,
      mode,
      extension,
      cases: cases.length,
      rows: rows.length,
      rawErrors: errors.length,
      allOwnersJoined: true,
    })
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
  save('CLOSURE.json', {
    fixtureAbsent: !existsSync(fixture),
    originalBoundsHeld: true,
    strictOwnerResultRetained: !!result,
  })
}
