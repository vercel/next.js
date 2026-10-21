const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const repo = path.resolve(__dirname, '../../..')
const sources = path.join(__dirname, 'fixtures/suite-error-ownership')
function portable(row) {
  const result = Object.fromEntries(
    Object.entries(row).filter(([key]) => !['stack', 'stacks'].includes(key))
  )
  if (result.errors) result.errors = result.errors.map(portable)
  if (result.module) result.module = portable(result.module)
  if (result.suites) result.suites = result.suites.map(portable)
  return result
}
let completeProfiles = 0
for (const name of [
  'root-before',
  'root-after',
  'nested-before',
  'nested-after',
  'parallel-shared',
  'parallel-distinct',
])
  for (const mode of ['development', 'production']) {
    const source = path.join(sources, name)
    const fixture = fs.mkdtempSync(
      path.join(repo, '.next-test-suite-error-owner-')
    )
    try {
      for (const file of fs
        .readdirSync(source)
        .filter((file) => file.endsWith('.txt')))
        fs.copyFileSync(
          path.join(source, file),
          path.join(fixture, file.slice(0, -4))
        )
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default {}\n'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.test.config.json'),
        JSON.stringify({
          maxWorkers: 1,
          projects: [
            {
              name: 'suite-error-ownership',
              environment: 'node',
              mode,
              include: ['contract.case.mjs'],
              testTimeout: 1000,
              sequence: {
                hooks: name.startsWith('parallel-') ? 'parallel' : 'stack',
              },
            },
          ],
        })
      )
      const env = {
        ...process.env,
        NODE_ENV: mode,
        NEXT_TELEMETRY_DISABLED: '1',
        WS1_AUDIT_FILE: path.join(fixture, 'events.jsonl'),
        WS1_MODULE_AUDIT_FILE: path.join(fixture, 'modules.jsonl'),
      }
      delete env.CI
      const child = spawnSync(
        process.execPath,
        [
          path.join(repo, 'packages/next/dist/bin/next'),
          'test',
          fixture,
          '--run',
          '--reporter=json',
          '--reporter=' + path.join(fixture, 'reporter.mjs'),
          '--outputFile=result.json',
        ],
        { cwd: fixture, env, encoding: 'utf8', timeout: 40000 }
      )
      assert.equal(child.error, undefined)
      assert.equal(child.signal, null)
      assert.equal(child.status, 1, child.stdout + child.stderr)
      const report = JSON.parse(
          fs.readFileSync(path.join(fixture, 'result.json'))
        ),
        lines = (name) =>
          fs
            .readFileSync(path.join(fixture, name), 'utf8')
            .trim()
            .split('\n')
            .map(JSON.parse)
      const result = {
        cases: report.testResults.flatMap((file) =>
          file.assertionResults.map(
            ({ fullName, status, failureMessages }) => ({
              fullName,
              status,
              failureMessages,
            })
          )
        ),
        events: lines('events.jsonl'),
        callbacks: lines('modules.jsonl').map(portable),
      }
      assert.deepEqual(
        result,
        JSON.parse(
          fs.readFileSync(path.join(source, 'pristine-' + mode + '.json'))
        )
      )
      const events = report.next.events,
        diagnostics = events.filter(
          (event) => event.type === 'diagnostic' && event.suiteError
        )
      assert.equal(diagnostics.length, 1)
      for (const diagnostic of diagnostics) {
        const owners = events
          .slice(0, events.indexOf(diagnostic))
          .filter(
            (event) =>
              event.type === 'suite-end' &&
              event.runId === diagnostic.runId &&
              event.entryId === diagnostic.entryId &&
              event.revision === diagnostic.revision &&
              event.suiteId === diagnostic.suiteError.suiteId
          )
        assert.equal(owners.length, 1)
        assert.deepEqual(
          owners[0].errors[diagnostic.suiteError.index],
          diagnostic.diagnostic
        )
      }
      for (const file of fs
        .readdirSync(source)
        .filter((file) => file.endsWith('.txt')))
        assert.deepEqual(
          fs.readFileSync(path.join(fixture, file.slice(0, -4))),
          fs.readFileSync(path.join(source, file))
        )
      completeProfiles++
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true })
    }
  }
console.log(
  JSON.stringify({
    completeProfiles,
    genuineProfiles: 12,
    allCaseEventCallbackAndErrorRowsExact: true,
    actualSuiteSlotAssociations: 12,
  })
)
