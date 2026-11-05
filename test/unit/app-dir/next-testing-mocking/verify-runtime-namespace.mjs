import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCompilerCase } from '../../../lib/next-testing-case-runner.mjs'
import {
  fixtureFiles,
  resolveFixturePath,
} from '../../../lib/next-testing-fixtures.cjs'

const [repo, output, kind = '--source', mode = 'development'] =
  process.argv.slice(2)
assert(repo && output)
assert(['--source', '--installed'].includes(kind))
assert(['development', 'production'].includes(mode))
const source = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'runtime-namespace-fixtures'
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
  expectedCount: 4,
  config: {
    projects: [
      {
        name: 'runtime-factory-namespace',
        mode,
        environment: 'node',
        isolate: true,
        include: ['admitted.case.mjs', 'alias.case.mjs'],
        testTimeout: 5000,
        hookTimeout: 5000,
      },
    ],
    maxWorkers: 1,
    fileParallelism: false,
  },
})
console.log(JSON.stringify(result))
