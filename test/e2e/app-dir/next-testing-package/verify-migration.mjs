import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const fixture = dirname(fileURLToPath(import.meta.url))
const repository = resolve(fixture, '../../../..')
const [outputArgument, nativeArgument] = process.argv.slice(2)
assert(
  outputArgument && nativeArgument,
  'Usage: node verify-migration.mjs <new-output-dir> <matching-native.node>'
)
assert.equal(process.platform, 'darwin')
assert.equal(process.arch, 'arm64')
const output = resolve(outputArgument)
const consumer = join(output, 'consumer')
mkdirSync(output)
mkdirSync(consumer)
const save = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n')
const sha = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const native = realpathSync(nativeArgument)
const nativeSHA = sha(native)
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
async function run(label, args, cwd = consumer, extraEnv = {}) {
  const name = `${++command}-${label}`
  const result = await runOwnedNode(args, {
    cwd,
    env: { ...environment, ...extraEnv },
    auditDir: join(output, name + '-processes'),
    timeoutMs: 180000,
  })
  writeFileSync(join(output, name + '.stdout'), result.stdout ?? '')
  writeFileSync(join(output, name + '.stderr'), result.stderr ?? '')
  save(name + '.result.json', result)
  assertOwnedNodeCompleted(result, name)
  assert.equal(result.status, 0, `See ${name}.stdout/.stderr`)
  return result.stdout
}
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
const nextPackage = JSON.parse(
  readFileSync(join(repository, 'packages/next/package.json'))
)
const nativePackage = join(output, 'native-package')
mkdirSync(nativePackage)
const nativeMetadata = JSON.parse(
  readFileSync(
    join(repository, 'crates/next-napi-bindings/npm/darwin-arm64/package.json')
  )
)
writeFileSync(
  join(nativePackage, 'package.json'),
  JSON.stringify({ ...nativeMetadata, version: nextPackage.version }, null, 2)
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
cpSync(join(fixture, 'migration'), consumer, { recursive: true })
const metadata = JSON.parse(readFileSync(join(consumer, 'package.json')))
Object.assign(
  metadata.dependencies,
  Object.fromEntries(
    Object.entries(archives).map(([name, file]) => [name, 'file:' + file])
  )
)
writeFileSync(join(consumer, 'package.json'), JSON.stringify(metadata, null, 2))
await run('install', [
  npm,
  'install',
  '--ignore-scripts',
  '--omit=optional',
  '--no-audit',
  '--no-fund',
])
const installed = createRequire(join(consumer, 'package.json'))
for (const name of Object.keys(archives)) {
  const file = realpathSync(installed.resolve(name))
  assert(
    file.startsWith(realpathSync(consumer) + '/'),
    `${name} must resolve inside the consumer`
  )
}
assert.equal(sha(installed.resolve('@next/swc-darwin-arm64')), nativeSHA)
for (const name of ['vitest', 'vite'])
  assert.throws(() => installed.resolve(name))
const typeResults = []
for (const [resolution, module] of [
  ['bundler', 'esnext'],
  ['node16', 'node16'],
]) {
  const raw = await run('types-' + resolution, [
    npm,
    'run',
    'typecheck',
    '--',
    '--moduleResolution',
    resolution,
    '--module',
    module,
    '--listFiles',
  ])
  const files = raw.split(/\r?\n/).map((file) => resolve(consumer, file))
  for (const file of [
    'setup.ts',
    'shared-matchers.js',
    'matchers.d.ts',
    'tests/javascript.case.js',
    'tests/typescript.case.ts',
  ])
    assert(
      files.includes(join(consumer, file)),
      'Missing actual type input ' + file
    )
  typeResults.push({ resolution, expectedInputsPresent: true })
}
const expected = JSON.parse(readFileSync(join(consumer, 'expected.json')))
const projects = []
for (const project of ['node-dev', 'node-production']) {
  const reportFile = `${project}.json`
  await run(
    project,
    [
      npm,
      'run',
      project === 'node-dev' ? 'test:ci' : 'test:production',
      '--',
      ...(project === 'node-production' ? ['--reporter', 'json'] : []),
      '--outputFile',
      reportFile,
    ],
    consumer,
    { NODE_ENV: project === 'node-dev' ? 'development' : 'production', CI: '1' }
  )
  const report = JSON.parse(readFileSync(join(consumer, reportFile)))
  copyFileSync(join(consumer, reportFile), join(output, reportFile))
  assert.equal(report.success, true)
  assert.equal(report.numTotalTests, 2)
  assert.equal(report.numPassedTests, 2)
  const rows = report.next.events
    .filter((event) => event.type === 'output')
    .flatMap((event) => event.text.split(/\r?\n/))
    .filter((line) => line.startsWith('PACKED_MIGRATION_RAW '))
    .map((line) => JSON.parse(line.slice('PACKED_MIGRATION_RAW '.length)))
  assert.deepEqual(rows, expected)
  save(project + '-observations.json', rows)
  projects.push({ project, passed: 2, fullRows: rows.length })
}
for (const file of [
  'setup.ts',
  'shared-matchers.js',
  'matchers.d.ts',
  'tests/javascript.case.js',
  'tests/typescript.case.ts',
])
  assert(
    readFileSync(join(consumer, file)).equals(
      readFileSync(join(fixture, 'migration', file))
    )
  )
assert(!existsSync(join(consumer, 'node_modules/vitest')))
save('passed.json', {
  node: process.execPath,
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  nativeSHA,
  cleanConsumer: consumer,
  noVitestOrViteRuntime: true,
  typeResults,
  projects,
})
console.log(`Installed migration smoke passed: ${output}`)
