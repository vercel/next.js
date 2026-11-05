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
      expectedCount: 8,
      timeoutMs: 180000,
      check(report) {
        assert.deepEqual(
          report.testResults
            .flatMap((file) =>
              file.assertionResults.map((test) => test.fullName)
            )
            .sort(),
          [
            'extra-builder-option',
            'extra-tuple-option',
            'inherited-injected-array',
            'inherited-scope-array',
            'long-injected',
            'long-tuple',
            'ordinary-array',
            'proxy-options',
          ].sort()
        )
      },
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
