import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'
import {
  resolveFixturePath,
  fixtureFiles,
} from '../../lib/next-testing-fixtures.cjs'

const [repo, output, mode, , group] = process.argv.slice(2)
const here = path.dirname(fileURLToPath(import.meta.url))
assert(['paired-two', 'cycle-runtime'].includes(group))
const packages = {
  'paired-two': ['next-test-pair2-a', 'next-test-pair2-b'],
  'cycle-runtime': ['next-test-native-cycle2'],
}[group]
const expectedNames = {
  'paired-two': [
    'keeps two independent native static runtime actual reset and unmock targets',
  ],
  'cycle-runtime': [
    'retains actual external CommonJS cycle across static runtime actual reset and unmock',
  ],
}[group]

const source = path.join(here, 'native-paired-cycles-fixtures', group)
const files = fixtureFiles(source).map((file) => {
  const relative = file.replace(/\.txt$/, '')
  return {
    target: relative,
    bytes: fs.readFileSync(resolveFixturePath(path.join(source, file))),
  }
})
const result = await runCompilerCase({
  repo,
  output,
  mode,
  files,
  packages,
  expectedNames,
  config: {
    maxWorkers: 1,
    projects: [
      {
        name: 'native-pair-cycle',
        mode,
        environment: 'node',
        include: ['*.test.mjs'],
        testTimeout: 10000,
        hookTimeout: 10000,
      },
    ],
  },
})
const checks = { ...result, group }
fs.writeFileSync(
  path.join(output, 'CHECKS.json'),
  JSON.stringify(checks) + '\n'
)
process.stdout.write(JSON.stringify(checks) + '\n')
