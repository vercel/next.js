import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fixtureFiles,
  resolveFixturePath,
} from '../../lib/next-testing-fixtures.cjs'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'

const [repo, output, mode, kind, group] = process.argv.slice(2)
assert(['source', 'installed'].includes(kind))
assert(['bracketing-cuts', 'two-earlier-cuts'].includes(group))
const source = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'native-unmock-multiple-cuts-fixtures',
  group
)
const files = fixtureFiles(source).map((file) => ({
  target: file.replace(/\.txt$/, ''),
  bytes: fs.readFileSync(resolveFixturePath(path.join(source, file))),
}))
const result = await runCompilerCase({
  repo,
  output,
  mode,
  files,
  packages: ['next-test-native-cycle2'],
  expectedNames: [
    'retains actual external CommonJS cycle across static runtime actual reset and unmock',
  ],
})
const checks = { ...result, group }
fs.writeFileSync(
  path.join(output, 'CHECKS.json'),
  JSON.stringify(checks) + '\n'
)
console.log(JSON.stringify(checks))
