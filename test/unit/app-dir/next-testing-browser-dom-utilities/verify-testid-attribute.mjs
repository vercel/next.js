import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createTestIdProfiles,
  buildNextTestIdConfiguration,
} from './test-id-attribute-driver.mjs'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
import { projectCleanupReport } from '../../../e2e/app-dir/next-testing-package/browser-public-default-cleanup/project.mjs'

const [consumerArg, outputArg, dependencyArg = consumerArg] =
  process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify-testid-attribute.mjs <consumerRoot> <new-evidence> [contained-dependencyRoot]'
)
const consumer = fs.realpathSync(consumerArg),
  dependencies = fs.realpathSync(dependencyArg)
const output = path.resolve(outputArg),
  directory = path.dirname(fileURLToPath(import.meta.url))
const hash = (value) => createHash('sha256').update(value).digest('hex')
const save = (where, name, value) =>
  fs.writeFileSync(
    path.join(where, name),
    JSON.stringify(value, null, 2) + '\n'
  )
const contained = (where) => {
  const relative = path.relative(consumer, where)
  assert(
    !path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith('..' + path.sep),
    'Runtime, Native, dependencies and fixtures must be inside the consumer: ' +
      where
  )
  return where
}
contained(dependencies)
assert(!fs.existsSync(output), 'Evidence directory must be new')
const require = createRequire(path.join(consumer, 'package.json'))
const dependency = createRequire(path.join(dependencies, 'package.json'))
const sourcePackage = path.join(consumer, 'packages/next/package.json')
const nextPackage = contained(
  fs.realpathSync(
    fs.existsSync(sourcePackage)
      ? path.dirname(sourcePackage)
      : path.dirname(require.resolve('next/package.json'))
  )
)
const next = contained(fs.realpathSync(path.join(nextPackage, 'dist/bin/next')))
const modules = Object.fromEntries(
  ['react', 'react-dom', 'playwright'].map((name) => {
    const packageJSON = contained(
      fs.realpathSync(dependency.resolve(name + '/package.json'))
    )
    return [
      name,
      {
        directory: path.dirname(packageJSON),
        version: JSON.parse(fs.readFileSync(packageJSON)).version,
      },
    ]
  })
)
for (const [name, parent] of [
  ['playwright-core', 'playwright'],
  ['scheduler', 'react-dom'],
]) {
  const resolver = createRequire(
    path.join(modules[parent].directory, 'package.json')
  )
  const packageJSON = contained(
    fs.realpathSync(resolver.resolve(name + '/package.json'))
  )
  modules[name] = {
    directory: path.dirname(packageJSON),
    version: JSON.parse(fs.readFileSync(packageJSON)).version,
  }
}
assert.equal(modules.react.version, modules['react-dom'].version)
assert.equal(modules.playwright.version, modules['playwright-core'].version)
assert(['1.61.0', '1.64.0'].includes(modules.playwright.version))
const binary = dependency('playwright').chromium.executablePath()
assert(
  fs.existsSync(binary),
  'The declared Chromium binary must already be installed'
)

// Resolve possible host bindings without loading any Native module or widening roots.
const nativeFiles = new Set(),
  sourceNative = path.join(consumer, 'packages/next-swc/native')
if (fs.existsSync(sourceNative)) {
  contained(fs.realpathSync(sourceNative))
  for (const name of fs.readdirSync(sourceNative))
    if (
      name.startsWith('next-swc.' + process.platform + '-' + process.arch) &&
      name.endsWith('.node')
    )
      nativeFiles.add(contained(fs.realpathSync(path.join(sourceNative, name))))
}
const bindingBase = '@next/swc-' + process.platform + '-' + process.arch
const bindingNames =
  process.platform === 'linux'
    ? [bindingBase + '-gnu', bindingBase + '-musl']
    : [bindingBase + (process.platform === 'win32' ? '-msvc' : '')]
const nextRequire = createRequire(path.join(nextPackage, 'package.json'))
for (const name of bindingNames) {
  try {
    nativeFiles.add(contained(fs.realpathSync(nextRequire.resolve(name))))
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
  }
}
assert(
  nativeFiles.size > 0,
  'A contained host Native binding is required; no external fallback'
)
const pinFiles = [
  fileURLToPath(import.meta.url),
  path.join(directory, 'test-id-attribute-driver.mjs'),
  path.join(directory, 'test-id-attribute-cases.mjs.txt'),
  ...['state', 'normalizer'].flatMap((kind) => [
    path.join(directory, 'test-id-attribute-' + kind + '.test.mjs.txt'),
    path.join(directory, 'test-id-attribute-' + kind + '.reference.json.txt'),
  ]),
  ...[
    'process-supervisor.mjs',
    'process-start-audit.cjs',
    'browser-public-default-cleanup/project.mjs',
    'browser-public-default-cleanup/reporter.mjs',
  ].map((name) =>
    path.join(directory, '../../../e2e/app-dir/next-testing-package', name)
  ),
  path.join(consumer, 'package.json'),
  path.join(consumer, 'pnpm-lock.yaml'),
  next,
  path.join(nextPackage, 'package.json'),
  ...Object.values(modules).map((module) =>
    path.join(module.directory, 'package.json')
  ),
  ...nativeFiles,
]
const inputGuard = () =>
  Object.fromEntries(
    pinFiles.map((file) => [file, hash(fs.readFileSync(file))])
  )
const expected = Object.fromEntries(
  ['state', 'normalizer'].map((kind) => [
    kind,
    JSON.parse(
      fs.readFileSync(
        path.join(
          directory,
          'test-id-attribute-' + kind + '.reference.json.txt'
        )
      )
    ),
  ])
)
const bodies = Object.fromEntries(
  ['state', 'normalizer'].map((kind) => [
    kind,
    fs.readFileSync(
      path.join(directory, 'test-id-attribute-' + kind + '.test.mjs.txt')
    ),
  ])
)
assert.equal(
  hash(bodies.state),
  '1abd459400d8878fd2854ae877f1687105adccde6d470d212418226c57d7ba47'
)
assert.equal(
  hash(bodies.normalizer),
  'c9bfc026fb4960e4e28104d7f3d81001cee7e06ef330080b6e0d2ab25f562778'
)
assert.equal(
  hash(
    fs.readFileSync(
      path.join(directory, 'test-id-attribute-state.reference.json.txt')
    )
  ),
  'a46a6b5365dfec3bd4d675ca058e595bf1d96c7c9dff30f6f3e3b3c2385320b3'
)
assert.equal(
  hash(
    fs.readFileSync(
      path.join(directory, 'test-id-attribute-normalizer.reference.json.txt')
    )
  ),
  '5439c2ffffc671e9595b3a2f457d9876db5fbc95ef12fc316b5bb5f52a41ae38'
)
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.mkdirSync(output)
const authoring = path.join(output, 'authored-configuration')
fs.mkdirSync(authoring)
const casesFile = path.join(authoring, 'test-id-attribute-cases.mjs')
fs.copyFileSync(
  path.join(directory, 'test-id-attribute-cases.mjs.txt'),
  casesFile
)
assert.equal(
  hash(fs.readFileSync(casesFile)),
  '92e5910142635cba4f8ae445b71836f521c8f98cfccdaff1c7cb97a7f971b8da'
)
pinFiles.push(casesFile)
const { normalizerCases } = await import(pathToFileURL(casesFile).href)
const testIdProfiles = createTestIdProfiles(normalizerCases)
assert.equal(testIdProfiles.length, 10)
assert.equal(new Set(testIdProfiles.map((profile) => profile.model)).size, 10)
assert.equal(Object.keys(expected.state.models).length, 2)
assert.equal(Object.keys(expected.normalizer.models).length, 8)
assert.deepEqual(
  expected.state.models.development,
  expected.state.models.production
)
for (const kind of ['state', 'normalizer'])
  assert.equal(hash(bodies[kind]), expected[kind].inputSHA256)
const before = inputGuard(),
  completed = []
save(output, 'INPUTS-BEFORE.json', before)
save(output, 'dependencies.json', {
  consumer,
  compilerRoot: consumer,
  nativeWatchRoot: consumer,
  next,
  nextPackage,
  nativeFiles: [...nativeFiles],
  modules,
  binary,
  node: process.version,
  genuineDriver: { playwright: '1.64.0', react: '19.2.0', reactDOM: '19.2.0' },
  allRuntimeRootsInsideConsumer: true,
})
const env = { ...process.env, FORCE_COLOR: '0', NEXT_TELEMETRY_DISABLED: '1' }
for (const key of [
  'CI',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
try {
  for (const profile of testIdProfiles) {
    const evidence = path.join(output, profile.id)
    fs.mkdirSync(evidence)
    const fixture = contained(
      fs.realpathSync(
        fs.mkdtempSync(path.join(consumer, '.next-test-browser-testid-'))
      )
    )
    let started = false,
      joined = false
    try {
      fs.writeFileSync(
        path.join(fixture, 'fixtures.test.mjs'),
        bodies[profile.kind]
      )
      fs.copyFileSync(
        path.join(
          directory,
          '../../../e2e/app-dir/next-testing-package/browser-public-default-cleanup/reporter.mjs'
        ),
        path.join(fixture, 'reporter.mjs')
      )
      fs.writeFileSync(
        path.join(fixture, 'package.json'),
        JSON.stringify({ private: true, type: 'module' }) + '\n'
      )
      fs.mkdirSync(path.join(fixture, 'node_modules'))
      for (const [name, target] of [
        ['next', nextPackage],
        ...Object.entries(modules).map(([name, value]) => [
          name,
          value.directory,
        ]),
      ])
        fs.symlinkSync(
          contained(target),
          path.join(fixture, 'node_modules', name),
          'dir'
        )
      const { configuration, source } = buildNextTestIdConfiguration(profile)
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default ' +
          JSON.stringify({ turbopack: { root: consumer } }) +
          '\n'
      )
      fs.writeFileSync(path.join(fixture, 'next.test.config.mjs'), source)
      fs.writeFileSync(path.join(evidence, 'next.test.config.mjs.txt'), source)
      const args = [
        next,
        'test',
        fixture,
        '--run',
        '--project=' + profile.selected,
        '--reporter=json',
        '--reporter=' + path.join(fixture, 'reporter.mjs'),
        '--outputFile=' + path.join(evidence, 'report.raw.json'),
      ]
      save(evidence, 'authored.json', {
        profile,
        args,
        fixture,
        test: configuration.test,
        compilerRoot: consumer,
        nativeWatchRoot: consumer,
        sourceSHA256: hash(bodies[profile.kind]),
        configSHA256: hash(source),
        rootMaxWorkers: 1,
        projects: 1,
        instances: 1,
        ownProjectMaxWorkers: false,
        testTimeoutMs: 5000,
        hookTimeoutMs: 5000,
        cliDeadlineMs: 120000,
        driverAdaptation: {
          removedOnly: ['Vite cacheDir', 'browser.provider', 'test.api port'],
          addedOnly: [
            'selected child environment=browser',
            'selected child mode',
          ],
          allTestIdOptionsAndUndefinedOwnPropertiesPreserved: true,
        },
      })
      started = true
      const owner = await runOwnedNode(args, {
        cwd: fixture,
        env: {
          ...env,
          NODE_ENV: profile.mode,
          CONCURRENCY_TRACE: path.join(evidence, 'trace.raw.jsonl'),
        },
        auditDir: path.join(evidence, 'owners'),
        timeoutMs: 120000,
      })
      save(evidence, 'owner.json', owner)
      fs.writeFileSync(path.join(evidence, 'stdout.log'), owner.stdout)
      fs.writeFileSync(path.join(evidence, 'stderr.log'), owner.stderr)
      assertOwnedNodeCompleted(owner, 'Browser testIdAttribute ' + profile.id)
      joined = true
      const report = JSON.parse(
        fs.readFileSync(path.join(evidence, 'report.raw.json'))
      )
      const trace = JSON.parse(
        fs.readFileSync(path.join(evidence, 'trace.raw.jsonl.complete.json'))
      )
      const projection = projectCleanupReport(report, trace, owner.status)
      save(evidence, 'projection.json', projection)
      assert.equal(
        hash(fs.readFileSync(path.join(fixture, 'fixtures.test.mjs'))),
        hash(bodies[profile.kind])
      )
      assert.equal(
        hash(fs.readFileSync(path.join(fixture, 'next.test.config.mjs'))),
        hash(source)
      )
      assert.equal(owner.status, 0)
      assert.deepEqual(projection, expected[profile.kind].models[profile.model])
      assert.equal(report.numPassedTests, profile.cases)
      assert.equal(projection.cases.length, profile.cases)
      assert.equal(projection.rows.length, profile.rows)
      completed.push({
        id: profile.id,
        mode: profile.mode,
        cases: profile.cases,
        rows: profile.rows,
        completeModelsExact: true,
        allOwnersJoined: true,
      })
      save(output, 'PROGRESS.json', {
        completed: completed.length,
        profiles: completed,
      })
    } finally {
      if (!started || joined)
        fs.rmSync(fixture, { recursive: true, force: true })
      save(evidence, 'closure.json', {
        cliStarted: started,
        allOwnersJoined: !started || joined,
        fixtureAbsent: !fs.existsSync(fixture),
      })
    }
  }
} finally {
  const after = inputGuard()
  save(output, 'INPUTS-AFTER.json', after)
  assert.deepEqual(after, before)
}
assert.equal(completed.length, 10)
save(output, 'VERIFIED.json', {
  profiles: 10,
  actualProfileComparisons: 10,
  namedReferenceEntries: 10,
  cases: completed.reduce((total, profile) => total + profile.cases, 0),
  rows: completed.reduce((total, profile) => total + profile.rows, 0),
  runs: completed,
  observedMaxConcurrentCLIs: 1,
  perCLIDeadlineMs: 120000,
  completeModelsExact: true,
  allRawReportsTracesAndErrorsRetained: true,
  noStackStringParityClaim: true,
  allOwnersJoined: true,
  allFixturesRemoved: true,
  graphAndInputPinsHeld: true,
  actualRuntimeRootsInsideConsumer: true,
  nativeWatchRoot: consumer,
})
