import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  cpSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Type-only gate. The consumer must already contain the locally packed candidate.
// This does not execute vi.mock or claim compiler/native mocking acceptance.
const fixture = dirname(fileURLToPath(import.meta.url))
const repository = resolve(fixture, '../../../..')
const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify-mock-authoring.mjs <external-consumer> <new-evidence-dir>'
)
const consumer = realpathSync(consumerArg)
assert(
  !consumer.startsWith(realpathSync(repository) + '/'),
  'Consumer must be outside the monorepo'
)
const output = resolve(outputArg)
mkdirSync(output)
const require = createRequire(join(consumer, 'package.json'))
const entry = realpathSync(require.resolve('next/experimental/testing/vitest'))
assert(entry.startsWith(join(consumer, 'node_modules') + '/'))
for (const dependency of ['vitest', 'vite'])
  assert.throws(() => require.resolve(dependency))
const declaration = realpathSync(
  require.resolve('next/dist/experimental/testing/vitest.d.ts')
)
assert(declaration.startsWith(join(consumer, 'node_modules') + '/'))
for (const file of ['mock-authoring', 'tsconfig.mock-authoring.json']) {
  cpSync(join(fixture, file), join(consumer, file), {
    recursive: true,
    force: false,
    errorOnExist: true,
  })
}
const expectedFiles = [
  'mock-authoring/mock-js.case.js',
  'mock-authoring/mock-ts.case.ts',
  'mock-authoring/dependency-js.js',
  'mock-authoring/dependency-ts.ts',
  'mock-authoring/subject-js.js',
  'mock-authoring/subject-ts.ts',
  'mock-authoring/unsupported-js.types.js',
  'mock-authoring/unsupported-ts.types.ts',
]
const env = { ...process.env }
delete env.NODE_OPTIONS
delete env.NODE_PATH
const results = []
for (const mode of ['bundler', 'node16']) {
  const args = [
    require.resolve('typescript/bin/tsc'),
    '-p',
    'tsconfig.mock-authoring.json',
    '--moduleResolution',
    mode,
    '--module',
    mode === 'bundler' ? 'esnext' : 'node16',
    '--listFiles',
  ]
  const result = spawnSync(process.execPath, args, {
    cwd: consumer,
    env,
    encoding: 'utf8',
    timeout: 60000,
  })
  writeFileSync(
    join(output, `${mode}.log`),
    (result.stdout ?? '') + (result.stderr ?? '')
  )
  assert.equal(result.status, 0, `Type check failed; see ${mode}.log`)
  const included = result.stdout
    .trim()
    .split(/\r?\n/)
    .map((file) => realpathSync(file))
  for (const file of expectedFiles)
    assert(
      included.includes(realpathSync(join(consumer, file))),
      `Missing input: ${file}`
    )
  const evidence = {
    mode,
    args,
    status: result.status,
    expectedFiles,
    included,
  }
  writeFileSync(
    join(output, `type-inputs-${mode}.json`),
    JSON.stringify(evidence, null, 2)
  )
  results.push({ mode, status: result.status, expectedFiles })
}
writeFileSync(
  join(output, 'passed.json'),
  JSON.stringify(
    {
      consumer,
      declaration,
      declarationSha256: createHash('sha256')
        .update(readFileSync(declaration))
        .digest('hex'),
      results,
      runtimeMocksExecuted: false,
    },
    null,
    2
  )
)
console.log(`Static mock authoring type checks passed: ${output}`)
