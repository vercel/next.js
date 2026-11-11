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
  const inputs = path.join(__dirname, 'fixtures/global-task-flags')
  const groups = await Promise.all(
    ['flags', 'attribution'].map(async (group) => ({
      group,
      source: await fs.readFile(path.join(inputs, `${group}.test.mjs.txt`)),
    }))
  )
  const evidence = await fs.mkdtemp(
    path.join(require('node:os').tmpdir(), 'next-global-task-flags-')
  )
  const prepared = []
  const results = []
  let success = false
  try {
    // Keep every shared-root input fixed until all real compiler readers join.
    for (const mode of ['development', 'production'])
      for (const { group, source } of groups) {
        const fixture = await fs.mkdtemp(
          path.join(repo, '.next-test-global-task-flags-')
        )
        const out = path.join(evidence, `${mode}-${group}`)
        const record = {
          mode,
          group,
          source,
          fixture,
          out,
          started: false,
          joined: false,
        }
        prepared.push(record)
        await fs.mkdir(out)
        await fs.writeFile(path.join(fixture, 'flags.test.mjs'), source)
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
                name: 'global-task-flags',
                environment: 'node',
                mode,
                include: ['flags.test.mjs'],
                testTimeout: 1000,
                hookTimeout: 1000,
              },
            ],
          })
        )
      }
    for (const record of prepared) {
      const { fixture, out, mode, group, source } = record
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
          timeoutMs: 45000,
          auditDir: path.join(out, 'owners'),
        }
      )
      await fs.writeFile(path.join(out, 'owner.json'), JSON.stringify(owner))
      assertOwnedNodeCompleted(
        owner,
        'actual global Task flag ' + mode + '/' + group
      )
      record.joined = true
      const raw = JSON.parse(await fs.readFile(reportPath, 'utf8'))
      const cases = raw.testResults.flatMap((file) => file.assertionResults)
      assert.equal(owner.status, 0)
      assert.equal(raw.success, true)
      assert.deepEqual(
        cases.map((test) => test.fullName),
        group === 'flags'
          ? [
              'ordinary global flags',
              'custom global flags',
              'foreign raw payload',
              'concurrent first',
              'concurrent second',
            ]
          : [
              'running owner running first',
              'running owner running second',
              'closed owner retained first',
              'closed owner closing second',
            ]
      )
      assert(
        cases.every(
          (test) =>
            test.status === 'passed' && test.failureMessages.length === 0
        )
      )
      assert.deepEqual(
        await fs.readFile(path.join(fixture, 'flags.test.mjs')),
        source
      )
      results.push({
        mode,
        group,
        cases: cases.length,
      })
    }
    success = true
    process.stdout.write(JSON.stringify({ results }) + '\n')
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
