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
const source = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases')
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
      expectedCount: 11,
      timeoutMs: 180000,
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
          provide: { value: 0 },
        },
      },
      check(report) {
        assert.deepEqual(
          report.testResults
            .flatMap((file) =>
              file.assertionResults.map((test) => test.fullName)
            )
            .sort(),
          [
            'numeric builder dependency',
            'numeric dependency',
            'numeric direct',
            'numeric first',
            'numeric first',
            'numeric hook dependency',
            'numeric outside',
            'numeric second',
            'numeric second',
            'numeric zero',
            'override numeric parent',
          ].sort()
        )

        const prefix = 'FIXTURE_DEPENDENCY_ROW '
        const groups = new Map()
        const rows = report.next.events
          .filter((event) => event.type === 'output')
          .flatMap((event) => event.text.split('\n'))
          .filter((line) => line.startsWith(prefix))
          .map((line) => JSON.parse(line.slice(prefix.length)))
        for (const row of rows) {
          if (!groups.has(row.contract)) groups.set(row.contract, [])
          groups.get(row.contract).push(row.phase)
        }
        assert.deepEqual(Object.fromEntries(groups), {
          builder: ['setup', 'builder', 'body', 'builder cleanup', 'cleanup'],
          chain: ['setup', 'answer setup', 'body', 'answer cleanup', 'cleanup'],
          direct: ['setup', 'body', 'cleanup'],
          file: ['setup', 'first', 'second', 'cleanup'],
          hooks: ['setup', 'before', 'body', 'after', 'cleanup'],
          override: [
            'base setup',
            'override setup',
            'inner',
            'override cleanup',
            'base cleanup',
            'base setup',
            'outside',
            'base cleanup',
          ],
          worker: ['setup', 'first', 'second', 'cleanup'],
          zero: ['setup', 'body', 'cleanup'],
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
