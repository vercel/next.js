import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fixtureFiles,
  resolveFixturePath,
} from '../../lib/next-testing-fixtures.cjs'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'

const [repo, output, mode, , group] = process.argv.slice(2)
const here = path.dirname(fileURLToPath(import.meta.url))
const groups = [
  'both-survive-interleaved',
  'a-cancelled-b-survives',
  'a-survives-b-cancelled',
  'both-cancelled-interleaved',
  'mirror-before-between',
]
assert(groups.includes(group))
const source = path.join(here, 'fixtures/native-multi-target/packages')
const files = fixtureFiles(source)
  .filter((file) => file.endsWith('.txt'))
  .map((file) => ({
    target: 'node_modules/' + file.slice(0, -4),
    bytes: fs.readFileSync(resolveFixturePath(path.join(source, file))),
  }))
files.push({
  target: 'contract.test.mjs',
  bytes: fs.readFileSync(
    path.join(
      here,
      '../../../crates/next-api/tests/fixtures/native-multi-target',
      group + '.mjs'
    )
  ),
})
const result = await runCompilerCase({
  repo,
  output,
  mode,
  files,
  packages: ['next-test-native-cuts-a', 'next-test-native-cuts-b'],
  expectedCount: 1,
  config: {
    maxWorkers: 1,
    projects: [
      {
        name: 'two-native-cut-targets',
        mode,
        environment: 'node',
        include: ['contract.test.mjs'],
        testTimeout: 10000,
        hookTimeout: 10000,
      },
    ],
  },
})
const checks = { ...result, group }
fs.writeFileSync(
  path.join(output, 'RESULT.json'),
  JSON.stringify(checks) + '\n'
)
fs.writeFileSync(
  path.join(output, 'CLOSED.json'),
  JSON.stringify({ originalOwnerJoined: true, fixtureRemoved: true }) + '\n'
)
process.stdout.write(JSON.stringify(checks) + '\n')
