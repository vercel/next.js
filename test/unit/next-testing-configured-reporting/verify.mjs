import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify.mjs <source-or-consumer-root> <new-evidence-dir>'
)
const consumer = realpathSync(consumerArg),
  output = resolve(outputArg)
mkdirSync(output)
const directory = dirname(fileURLToPath(import.meta.url))
const reference = JSON.parse(
  readFileSync(join(directory, 'reference.json'), 'utf8')
)
const body = readFileSync(join(directory, 'report.test.ts.txt'), 'utf8')
const reporter = readFileSync(join(directory, 'reporter.mjs.txt'), 'utf8')
const sha = (value) => createHash('sha256').update(value).digest('hex')
assert.equal(sha(body), reference.bodySHA256)
const require = createRequire(join(consumer, 'package.json'))
const next = require.resolve('next/dist/bin/next')
const save = (directory, name, value) =>
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n')
save(output, 'inputs.json', {
  runtime: process.version,
  executable: realpathSync(process.execPath),
  next: realpathSync(next),
  bodySHA256: sha(body),
  reporterSHA256: sha(reporter),
  reference: reference.reference,
})
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' }
for (const name of [
  'CI',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[name]
function jsonModel(report) {
  const model = structuredClone(report)
  delete model.next
  delete model.startTime
  for (const file of model.testResults) {
    file.name = basename(file.name)
    delete file.startTime
    delete file.endTime
    for (const test of file.assertionResults) delete test.duration
  }
  return model
}
const attributes = (text) =>
  Object.fromEntries(
    [...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [
      key,
      value,
    ])
  )
const decode = (text) =>
  text
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
function junitModel(text) {
  const suites = [
    ...text.matchAll(/<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g),
  ].map(([, props, body]) => ({
    attributes: Object.fromEntries(
      Object.entries(attributes(props)).filter(
        ([key]) => !['timestamp', 'time', 'hostname'].includes(key)
      )
    ),
    cases: [
      ...body.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g),
    ].map(([, props, body = '']) => ({
      attributes: Object.fromEntries(
        Object.entries(attributes(props)).filter(([key]) => key !== 'time')
      ),
      skipped: /<skipped\b/.test(body),
      failure: /<failure\b/.test(body),
      error: /<error\b/.test(body),
    })),
  }))
  const authorRows = [
    ...text.matchAll(/<system-out>([\s\S]*?)<\/system-out>/g),
  ].flatMap(([, body]) =>
    decode(body)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('CONFIG_REPORT_ROW '))
      .map((line) => JSON.parse(line.slice('CONFIG_REPORT_ROW '.length)))
  )
  return { suites, authorRows }
}
const runs = []
for (const mode of ['development', 'production']) {
  for (const [name, plan] of Object.entries(reference.plans)) {
    const evidence = join(output, mode + '-' + name)
    mkdirSync(evidence)
    const fixture = join(
      consumer,
      '.next-test-configured-reporting-' + randomUUID()
    )
    mkdirSync(fixture)
    symlinkSync(
      join(consumer, 'node_modules'),
      join(fixture, 'node_modules'),
      'dir'
    )
    writeFileSync(
      join(fixture, 'package.json'),
      '{"type":"module","private":true}\n'
    )
    writeFileSync(join(fixture, 'report.test.ts'), body)
    writeFileSync(join(fixture, 'reporter.mjs'), reporter)
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    const test = {
      include: ['report.test.ts'],
      maxWorkers: 1,
      fileParallelism: false,
      cache: false,
      testTimeout: 5000,
      hookTimeout: 5000,
      mode,
      environment: 'node',
      reporters: plan.reporters,
      outputFile: plan.outputFile,
    }
    writeFileSync(
      join(fixture, 'vitest.config.mjs'),
      'export default ' + JSON.stringify({ test }) + '\n'
    )
    let joined = false
    try {
      const args = [next, 'test', fixture, '--run', ...plan.flags]
      save(evidence, 'authored.json', {
        args,
        test,
        bodySHA256: sha(body),
        reporterSHA256: sha(reporter),
        bounds: { cli: 120000, test: 5000, hook: 5000 },
      })
      const result = await runOwnedNode(args, {
        cwd: fixture,
        env: { ...env, NODE_ENV: mode },
        auditDir: join(evidence, 'owners'),
        timeoutMs: 120000,
      })
      save(evidence, 'result.json', result)
      writeFileSync(join(evidence, 'stdout.log'), result.stdout)
      writeFileSync(join(evidence, 'stderr.log'), result.stderr)
      assertOwnedNodeCompleted(result, mode + '-' + name)
      joined = true
      assert.equal(
        result.status,
        0,
        `Configured reporter failed; see ${evidence}`
      )
      const outputs = {}
      for (const name of [
        'configured.json',
        'configured.xml',
        'cli.xml',
        'cli.json',
      ]) {
        const path = join(fixture, 'out', name)
        if (existsSync(path)) outputs[name] = readFileSync(path, 'utf8')
      }
      if (existsSync(join(fixture, 'custom.jsonl')))
        outputs['custom.jsonl'] = readFileSync(
          join(fixture, 'custom.jsonl'),
          'utf8'
        )
      for (const [name, content] of Object.entries(outputs))
        writeFileSync(join(evidence, name), content)
      const json = Object.values(outputs).find(
        (text) => text.trim().startsWith('{') && !text.includes('"phase"')
      )
      const xml = Object.values(outputs).find((text) =>
        text.trim().startsWith('<?xml')
      )
      const actual = {
        outputs: Object.keys(outputs),
        custom: outputs['custom.jsonl']
          ? outputs['custom.jsonl']
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line))
          : null,
        ...(json ? { json: jsonModel(JSON.parse(json)) } : {}),
        ...(xml ? { junit: junitModel(xml) } : {}),
      }
      save(evidence, 'actual-model.json', actual)
      assert.deepEqual(
        actual,
        plan.model,
        `${mode}-${name}: configured report or CLI precedence differs from genuine`
      )
      runs.push({
        mode,
        name,
        outputFiles: actual.outputs,
        actualCases: 3,
        genuineSupportedReportModelMatched: true,
        allOwnersJoined: true,
      })
    } finally {
      if (joined) rmSync(fixture, { recursive: true, force: true })
      save(evidence, 'closure.json', {
        allOwnersJoined: joined,
        fixtureAbsent: !existsSync(fixture),
      })
    }
  }
}
save(output, 'VERIFIED.json', {
  profiles: runs.length,
  runs,
  actualCases: runs.length * 3,
  allConfiguredArtifactsAndIndependentCliOverridesMatched: true,
  relativeCustomReporterRootAndCloseMatched: true,
  allOwnersJoined: true,
  allInputsRemovedAfterOwnedReadersJoined: true,
  rawReportsRetained: true,
  completeRawJUnitParityClaimed: false,
})
