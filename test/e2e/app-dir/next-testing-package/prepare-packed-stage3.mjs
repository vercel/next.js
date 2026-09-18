import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

// Consume L3's immutable combined packages. Never pack or modify a producer tree.
const [inputArg, outputArg] = process.argv.slice(2)
assert(
  inputArg && outputArg,
  'Usage: node prepare-packed-stage3.mjs <L3-handoff-dir> <new-output-dir>'
)
const input = realpathSync(inputArg)
const output = resolve(outputArg)
const repository = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
)
mkdirSync(output)
assert(
  !realpathSync(output).startsWith(repository + '/'),
  'Consumer must be external'
)
const consumer = join(output, 'consumer')
const packs = join(output, 'packs')
mkdirSync(consumer)
mkdirSync(packs)
const digest = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const runtime = {
  version: process.version,
  executable: realpathSync(process.execPath),
  executableSha256: digest(realpathSync(process.execPath)),
}
const readJSON = (file) => JSON.parse(readFileSync(file, 'utf8'))
const save = (file, data) =>
  writeFileSync(join(output, file), JSON.stringify(data, null, 2))
save('runtime.json', runtime)
const manifests = {}
for (const file of [
  'artifacts.json',
  'source-manifest.json',
  'archive-verification.json',
]) {
  copyFileSync(join(input, file), join(output, file))
  manifests[file] = digest(join(output, file))
}
save('manifest-hashes.json', manifests)
const artifacts = readJSON(join(output, 'artifacts.json'))
const source = readJSON(join(output, 'source-manifest.json'))
const archive = readJSON(join(output, 'archive-verification.json'))
assert(
  Object.keys(source.sourceSha256).length > 0,
  'Full producer source provenance required'
)
assert(
  Object.keys(source.native.sourceSha256).length > 0,
  'Native source provenance required'
)
for (const [file, sha256] of Object.entries(source.native.sourceSha256)) {
  assert.equal(
    source.sourceSha256[file],
    sha256,
    `Native/source pairing: ${file}`
  )
}
const names = [
  'next',
  '@next/env',
  '@next/swc-darwin-arm64',
  '@next/playwright',
]
const installedNames = names.filter((name) => name !== '@next/playwright')
assert.equal(process.platform, 'darwin')
assert.equal(process.arch, 'arm64')
const copied = {}
for (const [index, name] of names.entries()) {
  const artifact = artifacts[name]
  assert(
    artifact && /^[a-f0-9]{64}$/.test(artifact.sha256),
    `Missing archive: ${name}`
  )
  const original = isAbsolute(artifact.path)
    ? artifact.path
    : join(input, artifact.path)
  assert.equal(digest(original), artifact.sha256, `Archive hash: ${name}`)
  const path = join(packs, `${index}.tgz`)
  copyFileSync(original, path)
  assert.equal(digest(path), artifact.sha256)
  copied[name] = { path, sha256: artifact.sha256 }
}
save('installed-artifacts.json', copied)
writeFileSync(
  join(consumer, 'package.json'),
  JSON.stringify(
    {
      name: 'next-testing-stage3-consumer',
      version: '0.0.0',
      private: true,
      dependencies: {
        ...Object.fromEntries(
          installedNames.map((name) => [name, `file:${copied[name].path}`])
        ),
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
const npmExecutable = (process.env.PATH ?? '')
  .split(delimiter)
  .map((directory) => join(directory, 'npm'))
  .find((file) => existsSync(file))
assert(npmExecutable, 'npm must be on PATH')
const npmCli = realpathSync(npmExecutable)
assert(npmCli.endsWith('/npm-cli.js'), 'Expected the Node npm CLI')
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
for (const key of [
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
const args = [npmCli, 'install', '--ignore-scripts', '--no-audit', '--no-fund']
const result = await runOwnedNode(args, {
  cwd: consumer,
  env,
  auditDir: join(output, 'install-processes'),
  timeoutMs: 300000,
})
writeFileSync(join(output, 'install.log'), result.stdout + result.stderr)
save('install-command.json', {
  executable: process.execPath,
  nodeVersion: process.version,
  args,
  cwd: consumer,
  status: result.status,
})
assertOwnedNodeCompleted(result, 'immutable package installation')
assert.equal(result.status, 0, 'See install.log')
const require = createRequire(join(consumer, 'package.json'))
for (const name of ['vitest', 'vite', 'playwright', '@next/playwright'])
  assert.throws(() => require.resolve(name))
function inventory(root, directory = root, files = {}) {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name)
    const stat = lstatSync(path)
    assert(
      !stat.isSymbolicLink(),
      `Unexpected installed package symlink: ${path}`
    )
    if (stat.isDirectory()) inventory(root, path, files)
    else {
      assert(stat.isFile(), `Unexpected installed package entry: ${path}`)
      files[relative(root, path)] = digest(path)
    }
  }
  return files
}
const installed = {}
for (const name of installedNames) {
  const root = realpathSync(join(consumer, 'node_modules', name))
  assert(
    root.startsWith(realpathSync(consumer) + '/'),
    `External package resolution: ${name}`
  )
  const actual = inventory(root)
  installed[name] = { root, files: actual }
  save('installed-files.json', installed)
  assert.deepEqual(
    actual,
    archive.packages[name].files,
    `Installed bytes or file set differ: ${name}`
  )
}
const native = realpathSync(require.resolve('@next/swc-darwin-arm64'))
assert.equal(
  digest(native),
  source.native.nativeSha256,
  'Installed native identity'
)
const nativeProvenance = readJSON(join(dirname(native), 'provenance.json'))
assert.equal(nativeProvenance.nativeSha256, source.native.nativeSha256)
assert.deepEqual(nativeProvenance.sourceSha256, source.native.sourceSha256)
for (const entry of ['vitest', 'rsc', 'browser']) {
  const publicEntry = realpathSync(
    require.resolve(`next/experimental/testing/${entry}`)
  )
  assert(publicEntry.startsWith(installed.next.root + '/'))
  assert(
    existsSync(publicEntry.replace(/\.js$/, '.d.ts')),
    `Missing public declaration: ${entry}`
  )
}
save('prepared.json', {
  runtime,
  consumer: realpathSync(consumer),
  manifests,
  artifacts: copied,
  native: {
    path: native,
    sha256: digest(native),
    sourceSha256: source.native.sourceSha256,
  },
  producerSourceCount: Object.keys(source.sourceSha256).length,
  installedFileCounts: Object.fromEntries(
    installedNames.map((name) => [
      name,
      Object.keys(installed[name].files).length,
    ])
  ),
  browserDependenciesInstalled: false,
  runtimeExecuted: false,
})
console.log(`Immutable packages installed and verified: ${output}`)
