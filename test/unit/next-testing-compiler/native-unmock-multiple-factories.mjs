import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fixtureFiles,
  resolveFixturePath,
} from '../../lib/next-testing-fixtures.cjs'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'

const [repo, output, mode, , group] = process.argv.slice(2)
const source = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'native-unmock-multiple-factories-fixtures',
  group
)
const files = fixtureFiles(source)
  .filter((file) => file.endsWith('.txt'))
  .map((file) => ({
    target: file.slice(0, -4),
    bytes: fs.readFileSync(resolveFixturePath(path.join(source, file))),
  }))
const result = await runCompilerCase({
  repo,
  output,
  mode,
  files,
  packages: ['next-test-native-cycle2'],
  expectedCount: 1,
  config: {
    maxWorkers: 1,
    projects: [
      {
        name: 'after-cut-native-pair',
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
  path.join(output, 'CHECKS.json'),
  JSON.stringify(checks) + '\n'
)
process.stdout.write(JSON.stringify(checks) + '\n')
