import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fixtureFiles,
  resolveFixturePath,
} from '../../lib/next-testing-fixtures.cjs'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'

const [consumer, output] = process.argv.slice(2)
assert(consumer && output, 'Expected consumer and output directories')
fs.mkdirSync(output)
const source = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'node-records'
)
const files = fixtureFiles(source)
  .filter((name) => name.endsWith('.test.mjs.txt'))
  .map((name) => ({
    target: name.slice(0, -4),
    bytes: fs.readFileSync(resolveFixturePath(path.join(source, name))),
  }))
const profiles = []
for (const mode of ['development', 'production']) {
  profiles.push(
    await runCompilerCase({
      repo: consumer,
      output: path.join(output, mode),
      mode,
      files,
      expectedNames: [
        'registration order precedes reversed callback parameters',
        'actual dependency DFS precedes its selected auto consumer',
        'scoped registrations precede test auto despite reversed request order',
        'scoped values are reused while actual test cleanup joins each attempt',
        'same-name parent and child precede their later automatic consumer',
      ],
      timeoutMs: 120000,
      config: {
        test: {
          mode,
          environment: 'node',
          include: ['**/*.test.mjs'],
          maxWorkers: 1,
          fileParallelism: false,
          testTimeout: 5000,
          hookTimeout: 5000,
          includeTaskLocation: false,
        },
      },
      check(report) {
        const prefix = 'FIXTURE_ORDER_ROW '
        const rows = report.next.events
          .filter((event) => event.type === 'output')
          .flatMap((event) => event.text.split('\n'))
          .filter((line) => line.startsWith(prefix))
          .map((line) => JSON.parse(line.slice(prefix.length)))
        const groups = new Map()
        for (const row of rows) {
          if (!groups.has(row.group)) groups.set(row.group, [])
          groups.get(row.group).push(row.phase)
        }
        assert.deepEqual(Object.fromEntries(groups), {
          selected: [
            'first-in',
            'auto-in',
            'second-in',
            'body',
            'second-out',
            'auto-out',
            'first-out',
          ],
          dependency: [
            'wanted-in',
            'later-in',
            'auto-in',
            'body',
            'auto-out',
            'later-out',
            'wanted-out',
          ],
          scoped: [
            'worker-in',
            'file-in',
            'auto-in',
            'first-body',
            'auto-out',
            'auto-in',
            'second-body',
            'auto-out',
            'file-out',
            'worker-out',
          ],
          override: [
            'parent-in',
            'child-in',
            'auto-in',
            'body',
            'auto-out',
            'child-out',
            'parent-out',
          ],
        })
      },
    })
  )
}
const result = {
  allPassed: true,
  profiles,
  cases: profiles.reduce((sum, profile) => sum + profile.cases, 0),
  behavioralChecks: true,
  allOwnersJoined: true,
}
fs.writeFileSync(
  path.join(output, 'VERIFIED.json'),
  JSON.stringify(result, null, 2) + '\n'
)
console.log(JSON.stringify(result))
