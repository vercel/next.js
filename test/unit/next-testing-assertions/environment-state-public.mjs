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

const [lane, project, output, mode, profile, extension = 'mjs'] =
  process.argv.slice(2)
assert(['source', 'installed'].includes(lane))
assert(['development', 'production'].includes(mode))
assert(
  [
    'node',
    'custom',
    'custom-getter',
    'custom-undefined-second',
    'custom-throw-second',
    'state-inheritance',
    'custom-throw-second-cleanup',
    'custom-throw-second-undefined',
    'browser',
  ].includes(profile)
)
assert(['js', 'mjs'].includes(extension))
assert(project && output)
assert(!existsSync(output))
mkdirSync(output, { recursive: true })
const here = dirname(fileURLToPath(import.meta.url))
const modelPath = join(here, 'fixtures/environment-state', profile + '.json')
const model = JSON.parse(readFileSync(modelPath, 'utf8'))
const sha = (value) => createHash('sha256').update(value).digest('hex')
assert.equal(sha(model.body), model.bodySHA256)
const request = createRequire(join(project, 'package.json'))
const packageRoot = dirname(request.resolve('next/package.json'))
const fixture = join(project, '.next-test-environment-state-' + randomUUID())
const entry = 'probe.test.' + extension
const save = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n')
const pinFiles = [
  request.resolve('next/dist/experimental/testing/assertions'),
  request.resolve('next/dist/experimental/testing/runner'),
  join(packageRoot, 'dist/bin/next'),
]
const pins = Object.fromEntries(
  pinFiles.map((path) => [path, sha(readFileSync(path))])
)
const trace = join(output, 'trace.jsonl')
const errorTrace = join(output, 'case-errors.jsonl')
writeFileSync(trace, '')
writeFileSync(errorTrace, '')
const reporter = `import{appendFileSync}from'node:fs'\nexport default class Observer{onUserConsoleLog(log){for(const line of log.content.split('\\n'))if(line.startsWith('EXPECT_STATE_ROW '))appendFileSync(${JSON.stringify(trace)},line.slice(17)+'\\n')}onTestCaseResult(test){appendFileSync(${JSON.stringify(errorTrace)},JSON.stringify({name:test.name,result:test.result()})+'\\n')}}\n`
const environment = profile.startsWith('custom')
  ? ",environment:'./environment.mjs'"
  : profile === 'node'
    ? ",environment:'node'"
    : ''
const browser =
  profile === 'browser'
    ? ",browser:{enabled:true,headless:true,instances:[{browser:'chromium'}]}"
    : ''
const config = `export default{test:{mode:${JSON.stringify(mode)},include:[${JSON.stringify(entry)}],fileParallelism:false,maxWorkers:1,cache:false,testTimeout:5000,hookTimeout:5000${environment}${browser}}}\n`
const argv = [
  join(packageRoot, 'dist/bin/next'),
  'test',
  fixture,
  '--reporter=json',
  '--reporter=' + join(fixture, 'reporter.mjs'),
  '--outputFile=' + join(output, 'cases.json'),
]
let result
try {
  mkdirSync(fixture)
  writeFileSync(
    join(fixture, 'package.json'),
    JSON.stringify({ private: true, type: 'module' })
  )
  writeFileSync(join(fixture, entry), model.body)
  if (model.environmentTemplate) {
    assert.equal(
      model.environmentTemplate.split('__OWNED_ENVIRONMENT_TRACE__').length,
      2
    )
    writeFileSync(
      join(fixture, 'environment.mjs'),
      model.environmentTemplate.replace('__OWNED_ENVIRONMENT_TRACE__', trace)
    )
  }
  writeFileSync(join(fixture, 'reporter.mjs'), reporter)
  writeFileSync(join(fixture, 'vitest.config.mjs'), config)
  save('AUTHORED.json', {
    lane,
    mode,
    profile,
    extension,
    body: model.body,
    bodySHA256: sha(model.body),
    reporter,
    config,
    fixture,
    argv,
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
  assertOwnedNodeCompleted(result, 'public polling ownership')
  const rows = readFileSync(trace, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const rawCases = readFileSync(errorTrace, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  save('RAW-CASE-RESULTS.json', rawCases)
  const cases = rawCases.map((test) => ({
    name: test.name,
    state: test.result.state,
  }))
  const report = JSON.parse(readFileSync(join(output, 'cases.json'), 'utf8'))
  const summary = Object.fromEntries(
    Object.keys(model.summary).map((key) => [key, report[key]])
  )
  assert.equal(result.status, model.status)
  assert.deepEqual(rows, model.rows)
  assert.deepEqual(cases, model.cases)
  assert.deepEqual(summary, model.summary)
  assert.equal(rawCases.length, report.numTotalTests)
  for (const [path, hash] of Object.entries(pins))
    assert.equal(sha(readFileSync(path)), hash, path)
  assert.equal(sha(readFileSync(join(fixture, entry))), model.bodySHA256)
  save('PINS-AFTER.json', pins)
  save('VERIFIED.json', {
    lane,
    mode,
    profile,
    extension,
    cases,
    rows,
    summary,
    exactGenuineAuthorRows: true,
    exactCaseStates: true,
    runErrorAndRawFramesQualification:
      'open; raw report and callback errors retained',
    noSyntheticResults: true,
    originalBoundsHeld: true,
    node: { execPath: process.execPath, versions: process.versions },
    allOwnersJoined: true,
  })
  console.log(
    JSON.stringify({
      profile,
      extension,
      mode,
      cases: cases.length,
      rows: rows.length,
      exactGenuineEnvironment: true,
      allOwnersJoined: true,
    })
  )
} finally {
  rmSync(fixture, { recursive: true, force: true })
  save('CLOSURE.json', {
    fixtureAbsent: !existsSync(fixture),
    strictOwnerResultRetained: !!result,
    originalBoundsHeld: true,
  })
}
