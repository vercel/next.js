import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'
import {
  resolveFixturePath,
  fixtureFiles,
} from '../../lib/next-testing-fixtures.cjs'

const [repo, output, mode] = process.argv.slice(2)
const here = path.dirname(fileURLToPath(import.meta.url))
const packages = [
  'next-test-native-helpers-cjs',
  'next-test-native-helpers-esm',
]
const expectedNames = [
  'native cjs static runtime actual reset and unmock composition',
  'native esm static runtime actual reset and unmock composition',
]

const source = path.join(here, 'native-runtime-actual-fixtures')
const files = fixtureFiles(source).map((file) => {
  const relative = file.replace(/\.txt$/, '')
  return {
    target: relative.endsWith('.test.mjs')
      ? relative
      : 'node_modules/' + relative,
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
        name: 'native-helpers300',
        mode,
        environment: 'node',
        include: ['*.test.mjs'],
      },
    ],
  },
})
const checks = { ...result }
fs.writeFileSync(
  path.join(output, 'CHECKS.json'),
  JSON.stringify(checks) + '\n'
)
process.stdout.write(JSON.stringify(checks) + '\n')
