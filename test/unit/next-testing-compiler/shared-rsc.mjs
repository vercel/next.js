import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const corpus = path.join(here, 'fixtures/shared-rsc')
const stored = JSON.parse(
  fs.readFileSync(resolveFixturePath(path.join(corpus, 'corpus.json')), 'utf8')
)
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
export function readSharedRscCorpus(
  engine = process.versions.node.split('.')[0]
) {
  assert.equal(
    stored.authority,
    'ordinary Next.js AppPage HTTP; no Vitest RSC substitution'
  )
  const profile = stored.engines[engine]
  assert(profile, 'Shared RSC corpus requires a measured actual Node version')
  const sources = Object.fromEntries(
    Object.entries(stored.sources).map(([file, value]) => {
      const bytes = fs.readFileSync(
        resolveFixturePath(path.join(corpus, value.stored))
      )
      assert.equal(sha(bytes), value.sha256)
      return [file, bytes]
    })
  )
  const bytes = fs.readFileSync(
    resolveFixturePath(path.join(corpus, profile.model))
  )
  assert.equal(sha(bytes), profile.sha256)
  return { profile, sources, model: JSON.parse(bytes) }
}
export async function qualifySharedRsc(
  consumer,
  output,
  repository = path.resolve(here, '../../..'),
  kind = 'source'
) {
  consumer = path.resolve(consumer)
  output = path.resolve(output)
  repository = path.resolve(repository)
  assert(['source', 'installed'].includes(kind))
  assert(!fs.existsSync(output))
  fs.mkdirSync(output, { recursive: true })
  const engine = process.versions.node.split('.')[0],
    reference = readSharedRscCorpus(engine)
  assert.equal(
    process.version,
    reference.profile.actualNodeVersion,
    'Use the exact measured Node runtime'
  )
  const load = createRequire(path.join(consumer, 'package.json'))
  const { runOwnedNode, assertOwnedNodeCompleted } = await import(
    pathToFileURL(
      path.join(
        repository,
        'test/e2e/app-dir/next-testing-package/process-supervisor.mjs'
      )
    ).href
  )
  const fixture = fs.mkdtempSync(path.join(consumer, '.next-test-shared-rsc-'))
  const save = (name, value) =>
    fs.writeFileSync(
      path.join(output, name),
      JSON.stringify(value, null, 2) + '\n'
    )
  for (const [file, bytes] of Object.entries(reference.sources)) {
    const target = path.join(fixture, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, bytes)
  }
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    '{"private":true,"type":"module"}\n'
  )
  const nextConfig = {
    cacheComponents: false,
    turbopack: { root: consumer },
    experimental: { turbopackSharedRuntime: true },
  }
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify(nextConfig) + '\n'
  )
  const testConfig = {
    test: {
      fileParallelism: false,
      maxWorkers: 1,
      sequence: { seed: 1, shuffle: false },
      projects: [
        {
          name: 'shared-rsc',
          environment: 'rsc',
          mode: 'development',
          route: '/shared/[id]',
          isolate: false,
          include: ['first.case.mjs', 'second.case.mjs'],
          testTimeout: 10000,
          hookTimeout: 10000,
        },
      ],
    },
  }
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify(testConfig) + '\n'
  )
  const args = [
    load.resolve('next/dist/bin/next'),
    'test',
    fixture,
    '--run',
    '--reporter',
    'default',
    'json',
    '--outputFile',
    path.join(output, 'report.raw.json'),
  ]
  const env = Object.fromEntries(
    ['HOME', 'PATH', 'TMPDIR', 'LANG', 'SHELL']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]])
  )
  Object.assign(env, {
    NODE_ENV: 'development',
    CI: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    GIT_OPTIONAL_LOCKS: '0',
    FORCE_COLOR: '0',
  })
  save('REQUEST.json', {
    kind,
    consumer,
    actualNodeVersion: process.version,
    execPath: process.execPath,
    fixture,
    nextConfig,
    testConfig,
    args,
    sourcePins: stored.sources,
    actualOrdinaryAuthority: reference.profile,
    rootPackage: load.resolve('next/package.json'),
  })
  let joined = false,
    complete = false
  try {
    const result = await runOwnedNode(args, {
      cwd: fixture,
      env,
      auditDir: path.join(output, 'owners'),
      timeoutMs: 120000,
    })
    save('OWNER.json', result)
    fs.writeFileSync(path.join(output, 'stdout.log'), result.stdout)
    fs.writeFileSync(path.join(output, 'stderr.log'), result.stderr)
    assertOwnedNodeCompleted(result, 'shared RSC actual ' + kind)
    joined = true
    assert.equal(result.status, 0)
    const report = JSON.parse(
      fs.readFileSync(path.join(output, 'report.raw.json'), 'utf8')
    )
    assert.equal(report.success, true)
    assert.equal(report.numTotalTests, 2)
    assert.equal(report.numPassedTests, 2)
    assert.equal(report.numFailedTests, 0)
    const cases = report.testResults.flatMap((file) => file.assertionResults)
    assert.deepEqual(
      cases.map((value) => ({
        fullName: value.fullName,
        status: value.status,
        failureMessages: value.failureMessages,
      })),
      [
        {
          fullName:
            'first shared RSC file retains its actual request and shared module',
          status: 'passed',
          failureMessages: [],
        },
        {
          fullName:
            'second shared RSC file retains its own request and the same module',
          status: 'passed',
          failureMessages: [],
        },
      ]
    )
    const rows = []
    for (const line of result.stdout.split('\n')) {
      const at = line.indexOf('SHARED_RSC_ROW ')
      if (at >= 0)
        rows.push(JSON.parse(line.slice(at + 'SHARED_RSC_ROW '.length)))
    }
    save('OBSERVED.json', { cases, rows, report })
    assert.deepEqual(
      rows,
      reference.model.rows.map((row, index) => ({
        file: index ? 'second' : 'first',
        row,
      }))
    )
    save('RESULT.json', {
      kind,
      engine,
      actualNodeVersion: process.version,
      completeHttpRowsEqual: true,
      cases: 2,
      files: 2,
      sharedCounts: rows.map((value) => value.row.subject.count),
      allAuthoredBytesHeld: true,
      allOwnersJoined: true,
      ordinaryStrictOwnershipQualified: false,
      watchQualified: false,
    })
    complete = true
  } finally {
    for (const [file, bytes] of Object.entries(reference.sources))
      assert.deepEqual(fs.readFileSync(path.join(fixture, file)), bytes)
    fs.mkdirSync(path.join(output, 'fixture-config'), { recursive: true })
    for (const file of [
      'package.json',
      'next.config.mjs',
      'next.test.config.json',
    ])
      fs.copyFileSync(
        path.join(fixture, file),
        path.join(output, 'fixture-config', file)
      )
    if (joined) fs.rmSync(fixture, { recursive: true, force: true })
    save('CLOSED.json', {
      joined,
      complete,
      fixtureRemoved: !fs.existsSync(fixture),
      allAuthoredBytesHeld: true,
    })
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv[2] === '--check-corpus') {
    for (const engine of Object.keys(stored.engines))
      readSharedRscCorpus(engine)
    console.log(
      JSON.stringify({
        models: 4,
        bodies: 6,
        wholeHttpRows: 8,
        authority: stored.authority,
        strictOrdinaryOwnershipQualified: false,
        rawModelsAndSourceBytesExact: true,
      })
    )
  } else {
    await qualifySharedRsc(
      process.argv[2],
      process.argv[3],
      process.argv[4],
      process.argv[5]
    )
    console.log(
      fs
        .readFileSync(
          path.join(path.resolve(process.argv[3]), 'RESULT.json'),
          'utf8'
        )
        .trim()
    )
  }
}
