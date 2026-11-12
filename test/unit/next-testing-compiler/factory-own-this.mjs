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
assert(['own-this-arrow', 'own-this-function'].includes(group))
const packages = {
  'own-this-arrow': ['next-test-ownthis'],
  'own-this-function': ['next-test-ownthis'],
}[group]
const expectedNames = {
  'own-this-arrow': [
    'measures nested callable dynamic this without changing factory receiver',
  ],
  'own-this-function': [
    'measures nested callable dynamic this without changing factory receiver',
  ],
}[group]

const source = path.join(here, 'factory-own-this-fixtures', group)
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
        name: 'factory-own-this',
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
