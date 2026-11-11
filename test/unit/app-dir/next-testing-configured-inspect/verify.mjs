import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createServer } from 'node:net'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const base = path.dirname(new URL(import.meta.url).pathname)
const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify.mjs <consumer> <new-output>'
)
const consumer = path.resolve(consumerArg)
const out = path.resolve(outputArg)
mkdirSync(out)
const load = createRequire(path.join(consumer, 'package.json'))
const bin = load.resolve('next/dist/bin/next')
const reference = JSON.parse(
  readFileSync(path.join(base, 'reference.json'), 'utf8')
)
const body = readFileSync(path.join(base, 'inspect.test.mjs.txt'), 'utf8')
const save = (filename, value) =>
  writeFileSync(filename, JSON.stringify(value, null, 2) + '\n')
assert.equal(
  createHash('sha256').update(body).digest('hex'),
  reference.bodySHA256
)
async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) =>
    server.once('error', reject).listen(0, '127.0.0.1', resolve)
  )
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
const first = await freePort()
const second = await freePort()
const plans = [
  { name: 'omitted', flags: [], enabled: false },
  { name: 'root-false', inspect: false, flags: [], enabled: false },
  { name: 'root-true', inspect: true, flags: [], enabled: true, port: 9229 },
  {
    name: 'root-address',
    inspect: `127.0.0.1:${first}`,
    flags: [],
    enabled: true,
    port: first,
  },
  {
    name: 'root-zero',
    inspect: '127.0.0.1:0',
    flags: [],
    enabled: true,
    port: 9229,
  },
  {
    name: 'cli-no-inspect',
    inspect: true,
    flags: ['--no-inspect'],
    enabled: false,
  },
  {
    name: 'cli-false',
    inspect: true,
    flags: ['--inspect=false'],
    enabled: false,
  },
  {
    name: 'cli-no-alias',
    inspect: true,
    flags: ['--inspect=no'],
    enabled: false,
  },
  {
    name: 'cli-enable',
    inspect: false,
    flags: [`--inspect=127.0.0.1:${second}`],
    enabled: true,
    port: second,
  },
  {
    name: 'cli-address',
    inspect: `127.0.0.1:${first}`,
    flags: [`--inspect=127.0.0.1:${second}`],
    enabled: true,
    port: second,
  },
  {
    name: 'cli-yes-alias',
    inspect: false,
    flags: ['--inspect=yes'],
    enabled: true,
    port: 9229,
  },
  {
    name: 'cli-suppresses-root-url',
    inspect: 'http://localhost:9238',
    flags: ['--no-inspect'],
    enabled: false,
  },
  {
    name: 'root-url-refusal',
    inspect: 'http://localhost:9238',
    flags: [],
    refusal: 'Inspector host cannot be a URL.',
  },
  {
    name: 'root-parallel-refusal',
    inspect: true,
    parallel: true,
    flags: [],
    refusal: 'no-file-parallelism',
  },
]
const rows = []
for (const mode of ['development', 'production']) {
  for (const plan of plans) {
    const dir = path.join(out, mode + '-' + plan.name)
    mkdirSync(dir)
    const fixture = path.join(
      consumer,
      '.next-test-configured-inspect-' + randomUUID()
    )
    mkdirSync(fixture)
    symlinkSync(
      path.join(consumer, 'node_modules'),
      path.join(fixture, 'node_modules'),
      'dir'
    )
    writeFileSync(
      path.join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    writeFileSync(
      path.join(fixture, 'package.json'),
      '{"private":true,"type":"module"}\n'
    )
    writeFileSync(path.join(fixture, 'inspect.test.mjs'), body)
    const settings = {
      mode,
      watch: false,
      include: ['inspect.test.mjs'],
      fileParallelism: false,
      ...(plan.inspect === undefined ? {} : { inspect: plan.inspect }),
      ...(plan.parallel ? { fileParallelism: true, maxWorkers: 2 } : {}),
    }
    writeFileSync(
      path.join(fixture, 'vitest.config.mjs'),
      `export default async () => ({test:${JSON.stringify(settings)}})\n`
    )
    const env = Object.fromEntries(
      ['HOME', 'PATH', 'TMPDIR', 'LANG', 'SHELL']
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]])
    )
    Object.assign(env, {
      NODE_ENV: mode,
      CI: '1',
      FORCE_COLOR: '0',
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_INSPECT_TRACE: path.join(dir, 'ROWS.jsonl'),
      NEXT_INSPECT_EXPECT: plan.enabled ? '1' : '0',
      NEXT_INSPECT_PORT: String(plan.port ?? 0),
    })
    const args = [
      bin,
      'test',
      fixture,
      '--run',
      '--reporter',
      'json',
      '--outputFile',
      path.join(dir, 'result.json'),
      ...plan.flags,
    ]
    save(path.join(dir, 'INPUTS.json'), {
      settings,
      args,
      envNames: Object.keys(env),
      bodySHA256: createHash('sha256').update(body).digest('hex'),
    })
    const result = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: path.join(dir, 'owners'),
      timeoutMs: 30000,
    })
    writeFileSync(path.join(dir, 'stdout.log'), result.stdout)
    writeFileSync(path.join(dir, 'stderr.log'), result.stderr)
    save(path.join(dir, 'OWNER.json'), result)
    assertOwnedNodeCompleted(result, mode + '-' + plan.name)
    if (plan.refusal) {
      assert.equal(result.status, 1)
      assert(result.stderr.includes(plan.refusal))
      assert(!existsSync(path.join(dir, 'ROWS.jsonl')))
      rows.push({ mode, plan: plan.name, refusal: plan.refusal, exitCode: 1 })
    } else {
      assert.equal(result.status, 0)
      const report = JSON.parse(
        readFileSync(path.join(dir, 'result.json'), 'utf8')
      )
      assert.equal(report.success, true)
      assert.equal(report.numTotalTests, 1)
      assert.equal(report.numPassedTests, 1)
      assert.equal(report.numFailedTests, 0)
      const observed = readFileSync(path.join(dir, 'ROWS.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse)
      assert.equal(observed.length, 1)
      assert.equal(observed[0].enabled, plan.enabled)
      assert.equal(observed[0].port, plan.port ?? null)
      const normalize = (value) => {
        if (Array.isArray(value)) return value.map(normalize)
        if (value && typeof value === 'object')
          return Object.fromEntries(
            Object.entries(value)
              .filter(
                ([name]) =>
                  !['startTime', 'endTime', 'duration', 'startAt'].includes(
                    name
                  )
              )
              .map(([name, item]) => [name, normalize(item)])
          )
        return typeof value === 'string'
          ? value.replaceAll(fixture, '<project>')
          : value
      }
      const { next: extension, ...standardReport } = report
      assert.equal(extension.version, 1)
      assert.deepEqual(extension.summary, {
        runId: extension.summary.runId,
        status: 'passed',
        files: { passed: 1, failed: 0, skipped: 0, cancelled: 0 },
        cases: { passed: 1, failed: 0, skipped: 0, cancelled: 0 },
        attempts: { passed: 1, failed: 0, skipped: 0, cancelled: 0 },
        errors: 0,
        warnings: 0,
        attachments: 0,
      })
      const fileStarts = extension.events.filter(
        (event) => event.type === 'file-start'
      )
      const caseStarts = extension.events.filter(
        (event) => event.type === 'case-start'
      )
      const caseEnds = extension.events.filter(
        (event) => event.type === 'case-end'
      )
      assert.equal(fileStarts.length, 1)
      assert.equal(caseStarts.length, 1)
      assert.equal(caseEnds.length, 1)
      const entry = fileStarts[0].entry
      assert.equal(entry.file, path.join(fixture, 'inspect.test.mjs'))
      assert.equal(entry.profile.mode, mode)
      assert.equal(caseStarts[0].entryId, entry.id)
      assert.equal(caseEnds[0].entryId, entry.id)
      assert.equal(caseEnds[0].caseId, caseStarts[0].caseId)
      assert.equal(caseEnds[0].status, 'passed')
      assert.equal(typeof caseStarts[0].caseId, 'string')
      assert(caseStarts[0].caseId.length > 0)
      assert(
        extension.events.every(
          (event) => event.runId === extension.summary.runId
        )
      )
      save(path.join(dir, 'NEXT-EXTENSION.json'), extension)
      const stable = normalize(standardReport)
      assert.deepEqual(stable, reference.stableReport)
      save(path.join(dir, 'STABLE-REPORT.json'), stable)
      rows.push({
        mode,
        plan: plan.name,
        observed,
        report: stable,
        exitCode: 0,
      })
    }
    assert.equal(
      readFileSync(path.join(fixture, 'inspect.test.mjs'), 'utf8'),
      body
    )
    rmSync(fixture, { recursive: true, force: true })
    assert(!existsSync(fixture))
  }
}
save(path.join(out, 'QUALIFIED.json'), {
  runtime: process.version,
  executable: process.execPath,
  reference: reference.reference,
  bodySHA256: createHash('sha256').update(body).digest('hex'),
  plans,
  rows,
  profiles: rows.length,
  actualPassedCases: rows.filter((row) => row.report).length,
  actualRefusals: rows.filter((row) => row.refusal).length,
  allReportsMatch: true,
  allOwnedProcessesJoined: true,
  allAuthoredBodiesHeld: true,
  allFixturesRemoved: true,
})
console.log(
  JSON.stringify({
    runtime: process.version,
    profiles: rows.length,
    actualPassedCases: rows.filter((row) => row.report).length,
    actualRefusals: rows.filter((row) => row.refusal).length,
    allReportsMatch: true,
    allOwnedProcessesJoined: true,
    allAuthoredBodiesHeld: true,
    allFixturesRemoved: true,
    passed: true,
  })
)
