import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [rootArg, outputArg] = process.argv.slice(2)
assert(rootArg && outputArg)
const root = resolve(rootArg),
  output = resolve(outputArg),
  corpus = join(
    dirname(fileURLToPath(import.meta.url)),
    'fixtures/json-suite-file-message'
  ),
  load = createRequire(join(root, 'package.json')),
  source = process.argv.includes('--source')
if (!source)
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const next = source
    ? join(root, 'packages/next/dist/bin/next')
    : load.resolve('next/dist/bin/next'),
  manifest = JSON.parse(await readFile(join(corpus, 'manifest.json'), 'utf8')),
  sha = (data) => createHash('sha256').update(data).digest('hex'),
  facts = []
function standard(raw) {
  const data = structuredClone(raw)
  delete data.next
  delete data.startTime
  for (const file of data.testResults) {
    delete file.startTime
    delete file.endTime
    delete file.duration
    file.name = basename(file.name)
    for (const test of file.assertionResults) {
      delete test.startTime
      delete test.duration
    }
  }
  return data
}
await mkdir(output, { recursive: true })
for (const profile of manifest.profiles) {
  const fixture = await mkdtemp(join(root, '.next-test-json-file-message-')),
    evidence = join(output, profile.mode + '-' + profile.name)
  await mkdir(evidence)
  let joined = false
  try {
    for (const [name, hash] of Object.entries(profile.sourceSHA256)) {
      const bytes = await readFile(join(corpus, profile.name, name + '.txt'))
      assert.equal(sha(bytes), hash)
      await writeFile(join(fixture, name), bytes)
    }
    const modules = join(fixture, 'node_modules')
    await mkdir(modules)
    for (const name of await readdir(join(root, 'node_modules'))) {
      if (['.vite', '.vite-temp', '.cache', '.vitest-cache'].includes(name))
        await mkdir(join(modules, name))
      else await symlink(join(root, 'node_modules', name), join(modules, name))
    }
    await writeFile(
      join(fixture, 'next.config.mjs'),
      'export default ' + JSON.stringify({ turbopack: { root } }) + '\n'
    )
    await writeFile(
      join(fixture, 'next.test.config.json'),
      JSON.stringify({
        maxWorkers: 1,
        projects: [
          {
            name: 'json213',
            mode: profile.mode,
            environment: 'node',
            include: ['*.case.mjs'],
            sequence: { hooks: 'stack' },
          },
        ],
      }) + '\n'
    )
    const report = join(evidence, 'report.json'),
      env = {
        ...process.env,
        NODE_ENV: profile.mode,
        NEXT_TELEMETRY_DISABLED: '1',
        TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
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
    const owner = await runOwnedNode(
      [
        next,
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=' + report,
      ],
      {
        cwd: fixture,
        env,
        timeoutMs: 120000,
        auditDir: join(evidence, 'owners'),
      }
    )
    await writeFile(
      join(evidence, 'OWNER.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    await writeFile(join(evidence, 'stdout.log'), owner.stdout)
    await writeFile(join(evidence, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, profile.mode + '/' + profile.name)
    joined = true
    assert.equal(owner.status, 1)
    const actual = JSON.parse(await readFile(report, 'utf8')),
      expected = JSON.parse(
        await readFile(
          join(corpus, profile.name, 'pristine-' + profile.mode + '.json'),
          'utf8'
        )
      )
    assert.deepEqual(standard(actual), standard(expected))
    for (const [name, hash] of Object.entries(profile.sourceSHA256))
      assert.equal(sha(await readFile(join(fixture, name))), hash)
    facts.push({
      mode: profile.mode,
      name: profile.name,
      completeReportEqual: true,
      rawMessagesUnchanged: true,
      allOwnersClosed: true,
      authoredBytesHeld: true,
    })
    await writeFile(
      join(output, 'PROGRESS.json'),
      JSON.stringify(facts, null, 2) + '\n'
    )
  } finally {
    if (joined) await rm(fixture, { recursive: true, force: true })
  }
}
await writeFile(
  join(output, 'CHECKS.json'),
  JSON.stringify(
    {
      profiles: facts.length,
      wholeReportsEqual: facts.length,
      rawFileAndCaseMessagesExact: true,
      authoredBytesHeld: true,
      allOwnersClosed: true,
      normalization: [
        'next extension',
        'top.startTime',
        'file.startTime/endTime/duration',
        'physical file root',
        'case.startTime/duration',
      ],
    },
    null,
    2
  ) + '\n'
)
