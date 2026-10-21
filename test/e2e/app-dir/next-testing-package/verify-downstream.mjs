import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [
  outputArgument,
  nativeArgument,
  tailwindArgument,
  workflowArgument,
  repo,
] = process.argv.slice(2)
assert(
  outputArgument && nativeArgument && tailwindArgument && workflowArgument,
  'Usage: node verify-downstream.mjs <new-output-dir> <matching-native.node> <tailwind-checkout> <workflow-checkout> [built-next-checkout]'
)
assert.equal(process.platform, 'darwin')
assert.equal(process.arch, 'arm64')
const repository = repo
  ? realpathSync(repo)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const output = resolve(outputArgument)
const native = realpathSync(nativeArgument)
const sha = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const nativeSHA = sha(native)
mkdirSync(output)
const save = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n')
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
for (const key of [
  'NODE_OPTIONS',
  'NODE_PATH',
  'CI',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete environment[key]
const executable = (name) => {
  const file = (process.env.PATH ?? '')
    .split(delimiter)
    .map((directory) => join(directory, name))
    .find((candidate) => existsSync(candidate))
  assert(file, `${name} must be available on PATH`)
  return realpathSync(file)
}
const npm = executable('npm')
const pnpm = executable('pnpm')
let command = 0
async function run(label, args, cwd, extraEnv = {}) {
  const name = `${++command}-${label}`
  const result = await runOwnedNode(args, {
    cwd,
    env: { ...environment, ...extraEnv },
    auditDir: join(output, name + '-processes'),
    timeoutMs: 600000,
  })
  writeFileSync(join(output, name + '.stdout'), result.stdout ?? '')
  writeFileSync(join(output, name + '.stderr'), result.stderr ?? '')
  save(name + '.result.json', result)
  assertOwnedNodeCompleted(result, name)
  assert.equal(result.status, 0, `See ${name}.stdout/.stderr`)
  return result.stdout
}

const sources = join(output, 'sources')
mkdirSync(sources)
const inputs = []
function recordFiles(directory, root, name) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) recordFiles(file, root, name)
    else if (entry.isFile())
      inputs.push({
        repository: name,
        path: relative(root, file),
        sha256: sha(file),
      })
    else throw new Error(`Expected regular downstream input ${file}`)
  }
}
const downstream = [
  {
    name: 'tailwindcss',
    root: realpathSync(tailwindArgument),
    revision: '257dedca20a412ebda722effdf265069232fa8d1',
    paths: ['packages/tailwindcss/src', 'packages/tailwindcss/package.json'],
  },
  {
    name: 'workflow',
    root: realpathSync(workflowArgument),
    revision: '9454d51db0d52d6be9bafea9c70ab6fc3a1ceba4',
    paths: [
      'packages/utils/src',
      'packages/utils/dist',
      'packages/utils/package.json',
      'packages/errors/src',
      'packages/errors/package.json',
    ],
  },
]
for (const source of downstream) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: source.root,
    encoding: 'utf8',
  })
  assert.equal(head.status, 0, head.stderr)
  assert.equal(head.stdout.trim(), source.revision, `${source.name} revision`)
  const target = join(sources, source.name)
  mkdirSync(target)
  for (const path of source.paths)
    cpSync(join(source.root, path), join(target, path), { recursive: true })
  recordFiles(target, target, source.name)
}
save('inputs.json', inputs)
const groups = [
  {
    name: 'tailwind-utils',
    include: ['tailwindcss/packages/tailwindcss/src/utils/*.test.ts'],
    snapshotSerializers: [
      './tailwindcss/packages/tailwindcss/src/test-utils/custom-serializer.ts',
    ],
  },
  {
    name: 'workflow-utils',
    include: ['workflow/packages/utils/src/*.test.ts'],
  },
  {
    name: 'workflow-errors',
    include: ['workflow/packages/errors/src/*.test.ts'],
  },
]
function copySources(consumer) {
  mkdirSync(consumer)
  for (const source of downstream)
    cpSync(join(sources, source.name), join(consumer, source.name), {
      recursive: true,
    })
}
function linkWorkspace(consumer) {
  const scope = join(consumer, 'node_modules/@workflow')
  mkdirSync(scope)
  symlinkSync(
    join(consumer, 'workflow/packages/utils'),
    join(scope, 'utils'),
    'dir'
  )
}
function assertSources(consumer) {
  for (const input of inputs)
    assert.equal(
      sha(join(consumer, input.repository, input.path)),
      input.sha256,
      `Downstream input changed: ${input.repository}/${input.path}`
    )
}
function assertions(report, consumer) {
  return report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      file: relative(consumer, file.name),
      name: test.fullName,
      status: test.status,
      failures: test.failureMessages,
    }))
  )
}

const reference = join(output, 'reference')
copySources(reference)
writeFileSync(
  join(reference, 'package.json'),
  JSON.stringify({
    private: true,
    type: 'module',
    dependencies: { vitest: '5.0.4', ms: '2.1.3' },
  })
)
writeFileSync(
  join(reference, 'vitest.config.mjs'),
  `export default ${JSON.stringify({
    cacheDir: './.vite-private',
    test: {
      maxWorkers: 1,
      fileParallelism: false,
      projects: groups.map((test) => ({ test })),
    },
  })}\n`
)
await run(
  'reference-install',
  [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund'],
  reference
)
linkWorkspace(reference)
await run(
  'reference',
  [
    join(reference, 'node_modules/vitest/vitest.mjs'),
    'run',
    '--reporter=json',
    '--outputFile=' + join(output, 'reference.json'),
  ],
  reference,
  { CI: '1' }
)
const expected = JSON.parse(readFileSync(join(output, 'reference.json')))
assert.equal(expected.success, true)
assert.equal(expected.numPassedTests, 277)
assert.equal(expected.testResults.length, 23)
assert.equal(expected.snapshot.matched, 33)
assertSources(reference)

const packs = join(output, 'packs')
mkdirSync(packs)
async function pack(directory) {
  const wrapper = `const {spawnSync}=require('node:child_process');const r=spawnSync(${JSON.stringify(pnpm)},process.argv.slice(1),{stdio:'inherit'});if(r.error)throw r.error;process.exit(r.status??1)`
  const raw = await run(
    'pack',
    ['-e', wrapper, 'pack', '--json', '--pack-destination', packs],
    directory,
    { npm_config_ignore_scripts: 'true' }
  )
  const result = JSON.parse(raw)
  return resolve(packs, result[0]?.filename ?? result.filename)
}
const nativePackage = join(output, 'native-package')
mkdirSync(nativePackage)
const nativeMetadata = JSON.parse(
  readFileSync(
    join(repository, 'crates/next-napi-bindings/npm/darwin-arm64/package.json')
  )
)
const nextMetadata = JSON.parse(
  readFileSync(join(repository, 'packages/next/package.json'))
)
writeFileSync(
  join(nativePackage, 'package.json'),
  JSON.stringify({ ...nativeMetadata, version: nextMetadata.version })
)
copyFileSync(native, join(nativePackage, nativeMetadata.main))
const archives = {
  next: await pack(join(repository, 'packages/next')),
  '@next/env': await pack(join(repository, 'packages/next-env')),
  '@next/swc-darwin-arm64': await pack(nativePackage),
}
save(
  'archives.json',
  Object.fromEntries(
    Object.entries(archives).map(([name, file]) => [
      name,
      { file, sha256: sha(file) },
    ])
  )
)
const consumer = join(output, 'consumer')
copySources(consumer)
writeFileSync(
  join(consumer, 'package.json'),
  JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      react: '19.0.0',
      'react-dom': '19.0.0',
      ms: '2.1.3',
      ...Object.fromEntries(
        Object.entries(archives).map(([name, file]) => [name, 'file:' + file])
      ),
    },
  })
)
writeFileSync(join(consumer, 'next.config.mjs'), 'export default {}\n')
writeFileSync(
  join(consumer, 'next.test.config.json'),
  JSON.stringify({
    compatibility: 'vitest',
    maxWorkers: 1,
    projects: ['development', 'production'].flatMap((mode) =>
      groups.map((group) => ({
        ...group,
        name: group.name + '-' + mode,
        mode,
        environment: 'node',
      }))
    ),
  })
)
await run(
  'install',
  [
    npm,
    'install',
    '--ignore-scripts',
    '--omit=optional',
    '--no-audit',
    '--no-fund',
  ],
  consumer
)
linkWorkspace(consumer)
const installed = createRequire(join(consumer, 'package.json'))
for (const name of Object.keys(archives))
  assert(realpathSync(installed.resolve(name)).startsWith(consumer + '/'))
assert.equal(sha(installed.resolve('@next/swc-darwin-arm64')), nativeSHA)
for (const name of ['vitest', 'vite'])
  assert.throws(() => installed.resolve(name))
await run(
  'next',
  [
    installed.resolve('next/dist/bin/next'),
    'test',
    '.',
    '--run',
    '--reporter',
    'json',
    '--outputFile',
    join(output, 'next.json'),
  ],
  consumer,
  { CI: '1' }
)
const actual = JSON.parse(readFileSync(join(output, 'next.json')))
assert.equal(actual.success, true)
assert.equal(actual.numPassedTests, 554)
assert.equal(actual.testResults.length, 46)
assert.equal(actual.snapshot.matched, expected.snapshot.matched * 2)
assert.equal(actual.snapshot.total, expected.snapshot.total * 2)
const referenceRows = assertions(expected, reference)
const actualRows = assertions(actual, consumer)
const ordered = (rows) => rows.map((row) => JSON.stringify(row)).sort()
assert.deepEqual(
  ordered(actualRows),
  ordered([...referenceRows, ...referenceRows])
)
assertSources(consumer)
save('passed.json', {
  node: process.execPath,
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  nativeSHA,
  sources: downstream.map(({ name, revision }) => ({ name, revision })),
  reference: { tests: 277, files: 23, snapshots: 33 },
  next: {
    tests: 554,
    files: 46,
    snapshots: 66,
    modes: ['development', 'production'],
  },
  sourceFiles: inputs.length,
  unchangedBodies: true,
  noVitestOrViteRuntime: true,
})
console.log(`Installed downstream migration passed: ${output}`)
