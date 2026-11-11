import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fixtureFiles,
  resolveFixturePath,
} from '../../lib/next-testing-fixtures.cjs'
import { runCompilerCase } from '../../lib/next-testing-case-runner.mjs'

const [repo, output, mode] = process.argv.slice(2)
const directory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'cjs-parameter-grammar-fixtures'
)
const result = await runCompilerCase({
  repo,
  output,
  mode,
  files: fixtureFiles(directory).map((name) => ({
    target: name.replace(/\.txt$/, ''),
    bytes: fs.readFileSync(resolveFixturePath(path.join(directory, name))),
  })),
  expectedCount: 378,
  config: {
    maxWorkers: 1,
    projects: [
      {
        name: 'cjs-grammar291',
        mode,
        environment: 'node',
        include: ['contract.test.mjs'],
      },
    ],
  },
})
fs.writeFileSync(
  path.join(output, 'CHECKS.json'),
  JSON.stringify(result, null, 2) + '\n'
)
console.log(JSON.stringify(result))
