import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'
import {
  fixtureFiles,
  resolveFixturePath,
} from '../../lib/next-testing-fixtures.cjs'

const [repo, output, variant] = process.argv.slice(2)
const scenarios = {
  base: [1],
  lazy: [1],
  'missing-fields': [1],
  'production-base': [1, 'production'],
  'production-lazy': [1, 'production'],
  reset: [2],
  'reset-async-arrow': [2],
  'reset-async-function': [2],
  'reset-consumer-cycle': [3],
  'reset-multiple-consumers': [3],
  'retained-reset-require': [2],
  'retained-reset-async-arrow': [2],
  'retained-reset-async-function': [2],
  'retained-reset-consumer-cycle': [3],
  'retained-reset-multiple-consumers': [3],
  'production-retained': [2, 'production', 'retained-reset-require'],
  'production-direct': [2, 'production', 'reset'],
}
assert(repo && output && Object.hasOwn(scenarios, variant))
const [expectedCount, mode = 'development', sourceVariant = variant] =
  scenarios[variant]
const source = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  sourceVariant
)
const events = path.join(output, 'events.jsonl')
const files = fixtureFiles(source)
  .filter((file) => !['reporter.mjs.txt', 'package.json.txt'].includes(file))
  .map((file) => ({
    target: file.replace(/\.txt$/, ''),
    bytes: fs.readFileSync(resolveFixturePath(path.join(source, file))),
  }))
const result = await runCompilerCase({
  repo,
  output,
  mode,
  files,
  expectedCount,
  config: {
    projects: [
      {
        name: 'cjs-require-composition',
        mode,
        environment: 'node',
        include: ['contract.case.mjs'],
        testTimeout: 5000,
        hookTimeout: 5000,
      },
    ],
    maxWorkers: 1,
    fileParallelism: false,
  },
  env: { NEXT_REQUIRE_EVENTS: events },
  check() {
    const evaluations = fs
      .readFileSync(events, 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse)
    assert.equal(
      evaluations.filter((event) => event.name === 'target-evaluate').length,
      1
    )
  },
})
console.log(JSON.stringify(result))
