import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const consumer = resolve(consumerArg)
const output = resolve(outputArg)
const corpus = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/coverage-repeat'
)
const expected = JSON.parse(
  await readFile(
    join(
      corpus,
      process.argv.includes('--typed') ? 'pristine-typed.json' : 'pristine.json'
    ),
    'utf8'
  )
)
const source = await readFile(join(corpus, 'case.test.mjs.txt'))
assert.equal(
  createHash('sha256').update(source).digest('hex'),
  expected.sourceSHA256
)
const load = createRequire(join(consumer, 'package.json'))
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const next = load.resolve('next/dist/bin/next')
await mkdir(output)
const prepared = []
const facts = []
let readersClosed = true
for (const profile of expected.profiles) {
  const fixture = await mkdtemp(join(consumer, '.next-test-coverage-repeat-'))
  const evidence = join(output, profile.name)
  await mkdir(evidence)
  await symlink(
    join(consumer, 'node_modules'),
    join(fixture, 'node_modules'),
    'dir'
  )
  await writeFile(
    join(fixture, 'package.json'),
    '{"type":"module","private":true}\n'
  )
  await copyFile(
    join(corpus, 'case.test.mjs.txt'),
    join(fixture, 'case.test.mjs')
  )
  await writeFile(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  await writeFile(
    join(fixture, 'vitest.config.mjs'),
    'export default {test:{include:["case.test.mjs"],testTimeout:1000,hookTimeout:1000,maxWorkers:1,coverage:{enabled:false,provider:"v8",reporter:["json"],reportsDirectory:"coverage"}}}\n'
  )
  prepared.push({ profile, fixture, evidence })
}
await writeFile(
  join(output, 'inputs.json'),
  JSON.stringify({ allInputsPreparedBeforeReaders: true, prepared }, null, 2) +
    '\n'
)
const exists = async (file) => {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}
try {
  for (const { profile, fixture, evidence } of prepared) {
    const report = join(evidence, 'cases.json')
    readersClosed = false
    const owner = await runOwnedNode(
      [
        next,
        'test',
        ...(process.argv.includes('--directory-after-flags')
          ? profile.args
          : [fixture]),
        '--run',
        '--reporter=json',
        '--outputFile=' + report,
        ...(process.argv.includes('--directory-after-flags')
          ? [fixture]
          : profile.args),
      ],
      {
        cwd: fixture,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          NEXT_TELEMETRY_DISABLED: '1',
          COVERAGE_REPEAT_MARKER: join(fixture, 'body.txt'),
        },
        auditDir: join(evidence, 'processes'),
        timeoutMs: 120000,
      }
    )
    await writeFile(
      join(evidence, 'owner.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    await writeFile(join(evidence, 'stdout.log'), owner.stdout)
    await writeFile(join(evidence, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, profile.name)
    readersClosed = true
    let raw
    if (await exists(report)) raw = JSON.parse(await readFile(report, 'utf8'))
    const actual = {
      name: profile.name,
      args: profile.args,
      exit: owner.status,
      cases:
        raw?.testResults.flatMap((file) =>
          file.assertionResults.map((test) => ({
            name: test.fullName,
            status: test.status,
          }))
        ) ?? [],
      body: await exists(join(fixture, 'body.txt')),
      coverage: await exists(join(fixture, 'coverage/coverage-final.json')),
      error:
        owner.stderr
          .split('\n')
          .find((line) =>
            line.startsWith('Expected a single value for option "--coverage "')
          ) ?? null,
    }
    await writeFile(
      join(evidence, 'actual.json'),
      JSON.stringify(actual, null, 2) + '\n'
    )
    assert.deepEqual(actual, profile)
    assert.deepEqual(await readFile(join(fixture, 'case.test.mjs')), source)
    facts.push({
      name: profile.name,
      completeCasesBodyCoverageErrorExitEqual: true,
      ownersClosed: true,
    })
    await writeFile(
      join(output, 'progress.json'),
      JSON.stringify({ facts }, null, 2) + '\n'
    )
  }
} finally {
  assert(readersClosed, 'Retain inputs until all actual readers join')
  for (const { fixture } of prepared)
    await rm(fixture, { recursive: true, force: true })
}
await writeFile(
  join(output, 'verified.json'),
  JSON.stringify(
    { profiles: facts.length, allEqual: true, allOwnersClosed: true, facts },
    null,
    2
  ) + '\n'
)
console.log(JSON.stringify({ profiles: facts.length, allEqual: true }))
