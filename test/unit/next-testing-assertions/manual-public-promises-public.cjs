const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

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
  const inputs = path.join(__dirname, 'fixtures/manual-public-promises')
  const reference = JSON.parse(
    await fs.readFile(path.join(inputs, 'reference.json'), 'utf8')
  )
  assert.equal(Object.keys(reference).length, 19)
  const batch = process.argv[2]
  const batches = {
    queue: [
      'accessor-iterator',
      'falsy-rejections',
      'ordered-rejections',
      'mixed-release',
      'replace-empty',
      'delete-queue',
      'swap-getter',
      'iterator-throw',
      'body-throw',
      'false-queue',
    ],
    ownership: [
      'beforeEach-detach',
      'body-throw-native',
      'late-native',
      'retry-retention',
      'first-getter-failure',
      'second-getter-failure',
    ],
    rejections: [
      'primitive-reasons',
      'rejection-count-skip',
      'falsy-count-success',
    ],
  }
  assert(Object.hasOwn(batches, batch))
  assert.deepEqual(
    Object.values(batches).flat().sort(),
    Object.keys(reference).sort()
  )
  const groups = await Promise.all(
    batches[batch].map(async (group) => ({
      group,
      source: await fs.readFile(path.join(inputs, `${group}.test.mjs.txt`)),
      expected: reference[group],
    }))
  )
  const evidence = await fs.mkdtemp(
    path.join(require('node:os').tmpdir(), 'next-manual-public-promises-')
  )
  const prepared = []
  const results = []
  let success = false
  try {
    // Keep every shared-root input fixed until all real compiler readers join.
    for (const mode of ['development', 'production'])
      for (const { group, source, expected } of groups) {
        const fixture = await fs.mkdtemp(
          path.join(repo, '.next-test-manual-public-promises-')
        )
        const out = path.join(evidence, `${mode}-${group}`)
        const record = {
          mode,
          group,
          source,
          expected,
          fixture,
          out,
          started: false,
          joined: false,
        }
        prepared.push(record)
        await fs.mkdir(out)
        await fs.writeFile(path.join(fixture, 'queue.test.mjs'), source)
        await fs.writeFile(
          path.join(fixture, 'package.json'),
          '{"type":"module"}'
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
                name: 'public-manual-queue',
                environment: 'node',
                mode,
                include: ['queue.test.mjs'],
                testTimeout: 1000,
                hookTimeout: 1000,
                includeTaskLocation: false,
              },
            ],
          })
        )
      }
    for (const record of prepared) {
      const { fixture, out, mode, group, source, expected } = record
      const reportPath = path.join(out, 'report.json')
      const env = {
        ...process.env,
        NODE_ENV: mode,
        NEXT_TELEMETRY_DISABLED: '1',
        FORCE_COLOR: '0',
      }
      for (const key of [
        'CI',
        'NODE_PATH',
        'NODE_OPTIONS',
        'NEXT_TEST_NATIVE_DIR',
        'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
      ])
        delete env[key]
      record.started = true
      const owner = await runOwnedNode(
        [
          path.join(repo, 'packages/next/dist/bin/next'),
          'test',
          fixture,
          '--run',
          '--reporter=json',
          '--outputFile=' + reportPath,
        ],
        {
          cwd: fixture,
          env,
          timeoutMs: 120000,
          auditDir: path.join(out, 'owners'),
        }
      )
      await fs.writeFile(path.join(out, 'owner.json'), JSON.stringify(owner))
      assertOwnedNodeCompleted(
        owner,
        'actual manual public Promise consumption ' + mode + '/' + group
      )
      record.joined = true
      const raw = JSON.parse(await fs.readFile(reportPath, 'utf8'))
      const actual = {
        rows: raw.next.events
          .filter((event) => event.type === 'output')
          .flatMap((event) =>
            event.text
              .split('\n')
              .filter((line) => line.startsWith('TASK_QUEUE_CONSUMER:'))
              .map((line) =>
                JSON.parse(line.slice('TASK_QUEUE_CONSUMER:'.length))
              )
          ),
        cases: raw.testResults
          .flatMap((file) => file.assertionResults)
          .map((test) => ({
            name: test.fullName,
            status: test.status,
            failureMessages: test.failureMessages,
          })),
        success: raw.success,
        exit: owner.status,
      }
      await fs.writeFile(
        path.join(out, 'actual.json'),
        JSON.stringify(actual, null, 2)
      )
      assert.deepEqual(actual, expected)
      assert.deepEqual(
        await fs.readFile(path.join(fixture, 'queue.test.mjs')),
        source
      )
      results.push({
        mode,
        group,
        cases: actual.cases.length,
        rows: actual.rows.length,
      })
    }
    success = true
    process.stdout.write(
      JSON.stringify({
        profiles: results.length,
        groups: groups.length,
        cases: results.reduce((total, profile) => total + profile.cases, 0),
        rows: results.reduce((total, profile) => total + profile.rows, 0),
      }) + '\n'
    )
  } catch (error) {
    error.message += '\nEvidence: ' + evidence
    throw error
  } finally {
    for (const record of prepared)
      if (!record.started || record.joined)
        await fs.rm(record.fixture, { recursive: true, force: true })
    if (success) await fs.rm(evidence, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
