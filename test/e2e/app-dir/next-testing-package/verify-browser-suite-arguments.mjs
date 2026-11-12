import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'
import { projectCleanupReport } from './browser-suite-arguments/project.mjs'

const [consumerArg, mode, outputArg, dependenciesArg = consumerArg] =
  process.argv.slice(2)
assert(
  consumerArg && outputArg && ['development', 'production'].includes(mode),
  'Usage: node verify-browser-suite-arguments.mjs <consumer-root> <development|production> <new-evidence-dir> [existing-physical-dependency-root]'
)

// The normal harness supplies its selected local SWC directory. Give each
// nested CLI an independent, read-only copy instead of fetching a package.
async function prepareNativeCarrier(fixture) {
  if (!process.env.NEXT_TEST_NATIVE_DIR) return undefined
  const sourceDirectory = fs.realpathSync(process.env.NEXT_TEST_NATIVE_DIR),
    candidates = fs
      .readdirSync(sourceDirectory)
      .filter(
        (name) =>
          name.startsWith(
            'next-swc.' + process.platform + '-' + process.arch
          ) && name.endsWith('.node')
      )
  assert.equal(candidates.length, 1, 'Expected one harness-selected SWC binary')
  const source = fs.realpathSync(path.join(sourceDirectory, candidates[0])),
    sourceStat = fs.statSync(source),
    directory = path.join(fixture, '.next-test-native'),
    file = path.join(directory, candidates[0]),
    fileHash = async (where) => {
      const digest = createHash('sha256')
      for await (const chunk of fs.createReadStream(where)) digest.update(chunk)
      return digest.digest('hex')
    }
  assert(sourceStat.isFile())
  fs.mkdirSync(directory)
  fs.copyFileSync(
    source,
    file,
    fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE
  )
  const copiedStat = fs.statSync(file),
    sourceSHA256 = await fileHash(source)
  assert.equal(await fileHash(file), sourceSHA256)
  assert.equal(copiedStat.size, sourceStat.size)
  assert.equal(copiedStat.nlink, 1)
  assert(sourceStat.dev !== copiedStat.dev || sourceStat.ino !== copiedStat.ino)
  fs.chmodSync(file, 0o444)
  fs.chmodSync(directory, 0o555)
  return {
    source,
    sourceSHA256,
    sourceSize: sourceStat.size,
    sourceInode: sourceStat.ino,
    sourceDevice: sourceStat.dev,
    sourceLinkCount: sourceStat.nlink,
    directory,
    file,
    size: copiedStat.size,
    inode: copiedStat.ino,
    device: copiedStat.dev,
    linkCount: copiedStat.nlink,
    independentReadOnlyCopy: true,
  }
}

function removeOwnedFixture(fixture) {
  const nativeDirectory = path.join(fixture, '.next-test-native')
  if (fs.existsSync(nativeDirectory)) fs.chmodSync(nativeDirectory, 0o755)
  fs.rmSync(fixture, { recursive: true, force: true })
}

const consumer = fs.realpathSync(consumerArg),
  dependencies = fs.realpathSync(dependenciesArg),
  output = path.resolve(outputArg),
  corpus = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'browser-suite-arguments'
  ),
  hash = (value) => createHash('sha256').update(value).digest('hex'),
  json = (file) => JSON.parse(fs.readFileSync(file)),
  save = (name, value) =>
    fs.writeFileSync(
      path.join(output, name),
      JSON.stringify(value, null, 2) + '\n'
    ),
  inputPins = {
    'fixtures.test.mjs.txt':
      '1b9caaf7393d509b852b5a961ed15e0d608a870487b32542e7f423bb4be5df87',
    'reference.json.txt':
      '84814c966561378956afdd2ec3ab49a711613b4ce4b886fdda445acd64a3d44a',
    'project.mjs':
      '71d8af052824da84b4fb832e890bff4fe4f35ec61ff57e81e41260df35367a52',
    'reporter.mjs':
      'fba5c0a98d68ba9624c96863b139484fd04a937559daeaefe1f697e3d44e4836',
    'suite-identities.mjs':
      '8827d54d905284f0dfbf9b8e64cb26b6a052b20ec046789d3fe0d639d7d162c3',
    'development.vitest.config.mjs.txt':
      '83fd3b6038097c5ca03cef75de9b133f1ef1c695c06712ace6b2f7f4b185028d',
    'production.vitest.config.mjs.txt':
      'd066b631a98823f2be61b651ca7e02f8f703308ba4b901ff334e8b7340d61467',
  },
  checkInputs = () => {
    for (const [name, expected] of Object.entries(inputPins))
      assert.equal(
        hash(fs.readFileSync(path.join(corpus, name))),
        expected,
        name
      )
  }
checkInputs()
const source = fs.readFileSync(path.join(corpus, 'fixtures.test.mjs.txt')),
  reference = json(path.join(corpus, 'reference.json.txt')),
  expected = reference.models[mode],
  genuineConfig = fs.readFileSync(
    path.join(corpus, mode + '.vitest.config.mjs.txt'),
    'utf8'
  ),
  start = genuineConfig.indexOf('const test=') + 'const test='.length,
  end = genuineConfig.indexOf(';export default defineConfig', start)
assert(start >= 'const test='.length && end > start)
const test = JSON.parse(genuineConfig.slice(start, end)),
  originalTest = structuredClone(test)
assert.equal(reference.inputSHA256, hash(source))
assert.deepEqual(reference.models.development, reference.models.production)
assert.equal(expected.cases.length, 1)
assert.equal(expected.rows.length, 5)
assert.deepEqual(test, {
  include: ['fixtures.test.mjs'],
  browser: {
    enabled: true,
    headless: true,
    instances: [{ browser: 'chromium' }],
  },
  testTimeout: 5000,
  hookTimeout: 5000,
  includeTaskLocation: false,
})
test.environment = 'browser'
test.mode = mode
const { environment, mode: selectedMode, ...publicTest } = test
assert.equal(environment, 'browser')
assert.equal(selectedMode, mode)
assert.deepEqual(publicTest, originalTest)
const load = createRequire(path.join(consumer, 'package.json')),
  dependency = createRequire(path.join(dependencies, 'package.json')),
  next = fs.realpathSync(load.resolve('next/dist/bin/next')),
  nextPackage = fs.realpathSync(
    path.dirname(load.resolve('next/package.json'))
  ),
  graph = Object.fromEntries(
    ['package.json', 'pnpm-lock.yaml'].map((name) => [
      name,
      hash(fs.readFileSync(path.join(consumer, name))),
    ])
  ),
  modules = Object.fromEntries(
    ['react', 'react-dom', 'playwright', 'playwright-core', 'scheduler'].map(
      (name) => {
        const resolver =
            name === 'playwright-core'
              ? createRequire(dependency.resolve('playwright/package.json'))
              : name === 'scheduler'
                ? createRequire(dependency.resolve('react-dom/package.json'))
                : dependency,
          packageFile = resolver.resolve(name + '/package.json')
        return [
          name,
          {
            directory: fs.realpathSync(path.dirname(packageFile)),
            version: resolver(name + '/package.json').version,
          },
        ]
      }
    )
  )
assert.equal(modules.react.version, modules['react-dom'].version)
assert.equal(modules.playwright.version, modules['playwright-core'].version)
assert(['1.61.0', '1.64.0'].includes(modules.playwright.version))
assert(
  fs.existsSync(dependency('playwright').chromium.executablePath()),
  'The declared Chromium binary must already be installed'
)
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.mkdirSync(output)
save('INPUTS-BEFORE.json', inputPins)
save('dependencies.json', { modules, compilerRoot: consumer })
const fixture = fs.realpathSync(
    fs.mkdtempSync(path.join(consumer, '.next-test-browser-suite-arguments-'))
  ),
  relative = path.relative(consumer, fixture)
assert(
  !path.isAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep)
)
let joined = false
let started = false
try {
  const sourceFile = path.join(fixture, 'fixtures.test.mjs'),
    configSource =
      'export default ' +
      JSON.stringify({ test: { maxWorkers: 1, projects: [{ test }] } }) +
      '\n'
  fs.writeFileSync(sourceFile, source)
  for (const name of ['reporter.mjs', 'suite-identities.mjs'])
    fs.copyFileSync(path.join(corpus, name), path.join(fixture, name))
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify({
      type: 'module',
      private: true,
      dependencies: Object.fromEntries(
        Object.entries(modules).map(([name, value]) => [name, value.version])
      ),
    }) + '\n'
  )
  fs.mkdirSync(path.join(fixture, 'node_modules'))
  fs.symlinkSync(nextPackage, path.join(fixture, 'node_modules/next'), 'dir')
  for (const [name, value] of Object.entries(modules))
    fs.symlinkSync(
      value.directory,
      path.join(fixture, 'node_modules', name),
      'dir'
    )
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.writeFileSync(path.join(fixture, 'next.test.config.mjs'), configSource)
  fs.writeFileSync(path.join(output, 'next.test.config.mjs.txt'), configSource)
  const env = {
    ...process.env,
    FORCE_COLOR: '0',
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_ENV: mode,
    CONCURRENCY_TRACE: path.join(output, 'trace.raw.jsonl'),
  }
  for (const key of [
    'CI',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  const args = [
    next,
    'test',
    fixture,
    '--run',
    '--reporter=json',
    '--reporter=' + path.join(fixture, 'reporter.mjs'),
    '--outputFile=' + path.join(output, 'report.raw.json'),
  ]
  save('authored.json', {
    mode,
    args,
    fixture,
    sourceSHA256: hash(source),
    referenceSHA256: inputPins['reference.json.txt'],
    originalTest,
    compilerRoot: consumer,
    processVersion: process.version,
    cliDeadlineMs: 120000,
    addedExecutionCarrierOnly: ['environment', 'mode'],
  })
  const nativeCarrier = await prepareNativeCarrier(fixture)
  save('native-carrier.json', nativeCarrier ?? { suppliedByHarness: false })
  if (nativeCarrier) env.NEXT_TEST_NATIVE_DIR = nativeCarrier.directory
  started = true
  const owner = await runOwnedNode(args, {
    cwd: fixture,
    env,
    auditDir: path.join(output, 'owners'),
    timeoutMs: 120000,
  })
  save('owner.json', owner)
  fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'D1 actual Suite arguments ' + mode)
  joined = true
  const trace = json(path.join(output, 'trace.raw.jsonl.complete.json')),
    report = json(path.join(output, 'report.raw.json')),
    projection = projectCleanupReport(report, trace, owner.status)
  save('projection.json', projection)
  assert.equal(trace.reporterVersion, 'suite-identity-v2')
  assert.equal(hash(fs.readFileSync(sourceFile)), reference.inputSHA256)
  assert.equal(
    hash(fs.readFileSync(path.join(fixture, 'next.test.config.mjs'))),
    hash(configSource)
  )
  assert.equal(owner.status, 0, owner.stderr)
  assert.deepEqual(projection, expected)
  assert.equal(report.numPassedTests, 1)
} finally {
  if (!started || joined) removeOwnedFixture(fixture)
  save('closure.json', {
    allOwnersJoined: joined,
    fixtureAbsent: !fs.existsSync(fixture),
  })
}
checkInputs()
for (const [name, pin] of Object.entries(graph))
  assert.equal(hash(fs.readFileSync(path.join(consumer, name))), pin)
assert.equal(fs.existsSync(fixture), false)
save('VERIFIED.json', {
  mode,
  selectedContract: 'qualified-suite-arguments-v2',
  profiles: 1,
  cases: 1,
  rows: 5,
  completeGenuineV2ModelExact: true,
  actualSuiteModuleParentIdentityObserved: true,
  unknownIDsRemainRawAndCollisionsRejected: true,
  frozenInputsHeld: true,
  graphPinsHeld: true,
  allOwnersJoined: true,
  allFixturesRemoved: true,
})
