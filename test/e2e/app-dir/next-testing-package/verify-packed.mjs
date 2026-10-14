import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Run after building the source/native pair. Outputs must be a new directory.
const fixture = dirname(fileURLToPath(import.meta.url))
const repository = resolve(fixture, '../../../..')
const [outputArg, nativeArg, hash] = process.argv.slice(2)
assert(
  outputArg && nativeArg && /^[a-f0-9]{64}$/.test(hash ?? ''),
  'Usage: node verify-packed.mjs <new-output-dir> <matching-native.node> <sha256>'
)
assert.equal(process.platform, 'darwin')
assert.equal(process.arch, 'arm64')
const output = resolve(outputArg)
const native = resolve(nativeArg)
const digest = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
assert.equal(digest(native), hash)
const provenance = JSON.parse(
  readFileSync(join(dirname(native), 'provenance.json'))
)
assert.equal(provenance.nativeSha256, hash)
for (const [file, expected] of Object.entries(provenance.sourceSha256)) {
  assert.equal(
    digest(join(repository, file)),
    expected,
    `Native source mismatch: ${file}`
  )
}
mkdirSync(output) // Never overwrite another run's evidence.
const packs = join(output, 'packs')
const consumer = join(output, 'consumer')
mkdirSync(packs)
mkdirSync(consumer)
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
for (const key of [
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
const npmExecutable = (process.env.PATH ?? '')
  .split(delimiter)
  .map((directory) => join(directory, 'npm'))
  .find((file) => existsSync(file))
assert(npmExecutable, 'npm must be available on PATH')
const npmCli = realpathSync(npmExecutable)
assert(npmCli.endsWith('/npm-cli.js'), 'Expected the Node npm CLI')
let commandId = 0
async function run(command, args, cwd = consumer, extraEnv = {}) {
  const name = `${++commandId}-${command.replaceAll('/', '_')}`
  assert(command === process.execPath || command === 'npm')
  const result = await runOwnedNode(
    command === 'npm' ? [npmCli, ...args] : args,
    {
      cwd,
      env: { ...env, ...extraEnv },
      auditDir: join(output, `${name}-processes`),
      timeoutMs: 300000,
    }
  )
  writeFileSync(
    join(output, `${name}.log`),
    (result.stdout ?? '') + (result.stderr ?? '')
  )
  console.log(
    JSON.stringify({
      command,
      args,
      cwd,
      status: result.status,
      log: `${name}.log`,
    })
  )
  assertOwnedNodeCompleted(result, name)
  assert.equal(
    result.status,
    0,
    `${command} failed; see ${name}.log: ${result.error ?? ''}`
  )
  return result.stdout
}
async function pack(directory) {
  const result = JSON.parse(
    await run(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', packs],
      directory
    )
  )
  return join(packs, result[0].filename)
}
const version = JSON.parse(
  readFileSync(join(repository, 'packages/next/package.json'))
).version
const nativePackage = join(output, 'native-package')
mkdirSync(nativePackage)
writeFileSync(
  join(nativePackage, 'package.json'),
  JSON.stringify(
    {
      name: '@next/swc-darwin-arm64',
      version,
      private: true,
      main: 'next-swc.darwin-arm64.node',
      os: ['darwin'],
      cpu: ['arm64'],
      files: ['next-swc.darwin-arm64.node', 'provenance.json'],
      license: 'MIT',
    },
    null,
    2
  )
)
copyFileSync(native, join(nativePackage, 'next-swc.darwin-arm64.node'))
copyFileSync(
  join(dirname(native), 'provenance.json'),
  join(nativePackage, 'provenance.json')
)
const artifacts = {
  next: await pack(join(repository, 'packages/next')),
  '@next/env': await pack(join(repository, 'packages/next-env')),
  '@next/swc-darwin-arm64': await pack(nativePackage),
  '@next/playwright': await pack(join(repository, 'packages/next-playwright')),
}
writeFileSync(
  join(output, 'artifacts.json'),
  JSON.stringify(
    Object.fromEntries(
      Object.entries(artifacts).map(([name, path]) => [
        name,
        { path, sha256: digest(path) },
      ])
    ),
    null,
    2
  )
)
for (const file of [
  'app',
  'cases',
  'next.config.js',
  'next.test.config.json',
  'tsconfig.authoring.json',
  'tsconfig.browser.json',
]) {
  cpSync(join(fixture, file), join(consumer, file), { recursive: true })
}
writeFileSync(
  join(consumer, 'package.json'),
  JSON.stringify(
    {
      name: 'next-testing-packed-consumer',
      version: '0.0.0',
      private: true,
      dependencies: {
        next: `file:${artifacts.next}`,
        '@next/env': `file:${artifacts['@next/env']}`,
        '@next/swc-darwin-arm64': `file:${artifacts['@next/swc-darwin-arm64']}`,
        react: '19.0.0',
        'react-dom': '19.0.0',
        'server-only': '0.0.1',
        typescript: '6.0.2',
        '@types/node': '20.17.7',
        '@types/react': '19.2.18',
      },
    },
    null,
    2
  )
)
await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'])
const require = createRequire(join(consumer, 'package.json'))
for (const name of ['next', '@next/env', '@next/swc-darwin-arm64']) {
  assert(
    realpathSync(require.resolve(name)).startsWith(realpathSync(consumer) + '/')
  )
}
for (const name of ['vitest', 'vite', 'playwright'])
  assert.throws(() => require.resolve(name))
const installedNative = realpathSync(require.resolve('@next/swc-darwin-arm64'))
assert.equal(digest(installedNative), hash)
const audit = join(output, 'audit-native.cjs')
writeFileSync(
  audit,
  `const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const original = process.dlopen;
process.dlopen = function(module, filename, ...rest) {
  if (String(filename).includes('swc') && String(filename).endsWith('.node')) {
    const actual = fs.realpathSync(filename);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(actual)).digest('hex');
    assert.equal(actual, ${JSON.stringify(installedNative)});
    assert.equal(sha256, ${JSON.stringify(hash)});
    fs.appendFileSync(process.env.PACKED_NATIVE_AUDIT, JSON.stringify({pid:process.pid,path:actual,sha256})+'\\n');
  }
  return original.call(this, module, filename, ...rest);
};\n`
)
async function types(config, expectedFiles) {
  for (const mode of ['bundler', 'node16']) {
    const stdout = await run(process.execPath, [
      'node_modules/typescript/bin/tsc',
      '-p',
      config,
      '--moduleResolution',
      mode,
      '--module',
      mode === 'bundler' ? 'esnext' : 'node16',
      '--listFiles',
    ])
    const included = stdout
      .trim()
      .split(/\r?\n/)
      .map((file) => realpathSync(file))
    for (const file of expectedFiles) {
      assert(
        included.includes(realpathSync(join(consumer, file))),
        `TypeScript omitted expected authoring input: ${file} (${mode})`
      )
    }
    writeFileSync(
      join(output, `type-inputs-${config}-${mode}.json`),
      JSON.stringify({ expectedFiles, included }, null, 2)
    )
  }
}
async function execute(project) {
  const auditLog = join(output, `native-${project}.jsonl`)
  await run(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'test',
      '.',
      '--run',
      '--project',
      project,
    ],
    consumer,
    {
      NODE_OPTIONS: `--import=${JSON.stringify(pathToFileURL(audit).href)}`,
      PACKED_NATIVE_AUDIT: auditLog,
    }
  )
  assert(
    readFileSync(auditLog, 'utf8').trim().length > 0,
    'Actual native load required'
  )
}
await types('tsconfig.authoring.json', [
  'cases/node-js.case.js',
  'cases/node-ts.case.ts',
  'cases/alias.case.ts',
  'cases/rsc-js.case.js',
  'cases/rsc-ts.case.tsx',
  'app/subject.tsx',
])
await execute('node')
await execute('rsc')
// Browser dependencies are installed only after Node/RSC authoring and execution pass.
await run('npm', [
  'install',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  'playwright@1.61.0',
  `file:${artifacts['@next/playwright']}`,
])
await types('tsconfig.browser.json', [
  'cases/browser-js.case.js',
  'cases/browser-ts.case.ts',
])
await run(process.execPath, [
  'node_modules/playwright/cli.js',
  'install',
  'chromium',
])
await execute('browser')
writeFileSync(
  join(output, 'passed.json'),
  JSON.stringify({ version, nativeSha256: hash, artifacts, consumer }, null, 2)
)
console.log(`Packed Node, RSC and browser checks passed: ${output}`)
