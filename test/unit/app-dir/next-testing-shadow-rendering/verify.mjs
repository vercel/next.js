import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
import { projectCleanupReport } from '../../../e2e/app-dir/next-testing-package/browser-public-default-cleanup/project.mjs'

const [consumerArg, outputArg, dependenciesArg = consumerArg] =
  process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify.mjs <consumer-root> <new-evidence-dir> [existing-dependency-root]'
)
const consumer = fs.realpathSync(consumerArg),
  dependencies = fs.realpathSync(dependenciesArg),
  output = path.resolve(outputArg),
  directory = path.dirname(fileURLToPath(import.meta.url))
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.mkdirSync(output)
const expected = JSON.parse(
    fs.readFileSync(path.join(directory, 'reference.json'), 'utf8')
  ),
  source = fs.readFileSync(path.join(directory, 'rendering.test.mjs.txt')),
  hash = (value) => createHash('sha256').update(value).digest('hex'),
  save = (where, name, value) =>
    fs.writeFileSync(
      path.join(where, name),
      JSON.stringify(value, null, 2) + '\n'
    )
assert.equal(hash(source), expected.sourceSHA256)
const require = createRequire(path.join(consumer, 'package.json')),
  dependency = createRequire(path.join(dependencies, 'package.json')),
  next = require.resolve('next/dist/bin/next')
const graph = Object.fromEntries(
  ['package.json', 'pnpm-lock.yaml'].map((name) => [
    name,
    hash(fs.readFileSync(path.join(consumer, name))),
  ])
)
const modules = Object.fromEntries(
  ['react', 'react-dom', 'playwright'].map((name) => [
    name,
    {
      directory: path.dirname(dependency.resolve(name + '/package.json')),
      version: dependency(name + '/package.json').version,
    },
  ])
)
assert.equal(modules.react.version, modules['react-dom'].version)
assert(
  fs.existsSync(dependency('playwright').chromium.executablePath()),
  'The declared Chromium binary must already be installed'
)
let compilerRoot = consumer
for (const { directory: moduleDir } of Object.values(modules))
  while (path.relative(compilerRoot, moduleDir).startsWith('..' + path.sep))
    compilerRoot = path.dirname(compilerRoot)
save(output, 'dependencies.json', {
  modules,
  compilerRoot,
  fixtureLocalLinksOnly: true,
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
const profiles = []
for (const mode of ['development', 'production']) {
  const evidence = path.join(output, mode)
  fs.mkdirSync(evidence)
  const fixture = fs.mkdtempSync(
    path.join(consumer, '.next-test-shadow-rendering-')
  )
  fs.writeFileSync(path.join(fixture, 'fixtures.test.mjs'), source)
  fs.copyFileSync(
    path.join(
      directory,
      '../../../e2e/app-dir/next-testing-package/browser-public-default-cleanup/reporter.mjs'
    ),
    path.join(fixture, 'reporter.mjs')
  )
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
  for (const name of fs.readdirSync(path.join(consumer, 'node_modules')))
    if (!(name in modules))
      fs.symlinkSync(
        path.join(consumer, 'node_modules', name),
        path.join(fixture, 'node_modules', name),
        fs.statSync(path.join(consumer, 'node_modules', name)).isDirectory()
          ? 'dir'
          : 'file'
      )
  for (const [name, value] of Object.entries(modules))
    fs.symlinkSync(
      value.directory,
      path.join(fixture, 'node_modules', name),
      'dir'
    )
  const test = {
    include: ['fixtures.test.mjs'],
    maxWorkers: 1,
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
    testTimeout: 5000,
    hookTimeout: 5000,
    includeTaskLocation: false,
    environment: 'browser',
    mode,
  }
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' +
      JSON.stringify({ turbopack: { root: compilerRoot } }) +
      '\n'
  )
  fs.writeFileSync(
    path.join(fixture, 'next.test.config.json'),
    JSON.stringify({ test }) + '\n'
  )
  const args = [
    next,
    'test',
    fixture,
    '--run',
    '--reporter=json',
    '--reporter=' + path.join(fixture, 'reporter.mjs'),
    '--outputFile=' + path.join(evidence, 'report.raw.json'),
  ]
  save(evidence, 'authored.json', {
    args,
    test,
    fixture,
    sourceSHA256: hash(source),
    cliDeadlineMs: 120000,
  })
  let joined = false
  try {
    const owner = await runOwnedNode(args, {
      cwd: fixture,
      env: {
        ...env,
        NODE_ENV: mode,
        CONCURRENCY_TRACE: path.join(evidence, 'trace.raw.jsonl'),
      },
      auditDir: path.join(evidence, 'owners'),
      timeoutMs: 120000,
    })
    save(evidence, 'owner.json', owner)
    fs.writeFileSync(path.join(evidence, 'stdout.log'), owner.stdout)
    fs.writeFileSync(path.join(evidence, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(
      owner,
      'real hydration and shadow selectors ' + mode
    )
    joined = true
    const report = JSON.parse(
        fs.readFileSync(path.join(evidence, 'report.raw.json'))
      ),
      trace = JSON.parse(
        fs.readFileSync(path.join(evidence, 'trace.raw.jsonl.complete.json'))
      ),
      projection = projectCleanupReport(report, trace, owner.status)
    save(evidence, 'projection.json', projection)
    assert.equal(
      hash(fs.readFileSync(path.join(fixture, 'fixtures.test.mjs'))),
      expected.sourceSHA256
    )
    assert.deepEqual(projection, expected.models[mode])
    assert.equal(report.numPassedTests, 4)
    assert.equal(owner.status, 0)
    profiles.push({
      mode,
      cases: 4,
      completeGenuineRenderingAndLocatorModelsExact: true,
      allOwnersJoined: true,
    })
  } finally {
    if (joined) fs.rmSync(fixture, { recursive: true, force: true })
    save(evidence, 'closure.json', {
      allOwnersJoined: joined,
      fixtureAbsent: !fs.existsSync(fixture),
    })
  }
}
for (const [name, pin] of Object.entries(graph))
  assert.equal(hash(fs.readFileSync(path.join(consumer, name))), pin)
save(output, 'VERIFIED.json', {
  profiles: profiles.length,
  cases: 8,
  completeGenuineRenderingAndLocatorModelsExact: true,
  runs: profiles,
  graphPinsHeld: true,
  allOwnersJoined: true,
  allFixturesRemoved: true,
  noClosedShadowFrameRouteOrGeneralHydrationClaim: true,
})
