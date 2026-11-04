import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const [consumerArg, mode, outputArg, ...optionalArgs] = process.argv.slice(2)
assert(
  consumerArg &&
    outputArg &&
    ['development', 'production'].includes(mode) &&
    optionalArgs.length <= 2,
  'Usage: node verify-browser-hook-parameters.mjs <consumer-root> <development|production> <new-evidence-dir> [existing-physical-dependency-root] [success|all|errors]'
)
const selectors = ['success', 'all', 'errors']
let dependenciesArg = consumerArg
let selector = 'success'
if (selectors.includes(optionalArgs[0])) {
  assert.equal(optionalArgs.length, 1)
  selector = optionalArgs[0]
} else if (optionalArgs.length > 0) {
  dependenciesArg = optionalArgs[0]
  selector = optionalArgs[1] ?? 'success'
}
assert(selectors.includes(selector))
if (selector !== 'success')
  assert.fail(
    'HOLD: native D1 error-origin assertions are not approved. The all/errors selections must not resolve Next, create fixtures or evidence, or emit qualification results.'
  )

const { runOwnedNode, assertOwnedNodeCompleted } = await import(
  './process-supervisor.mjs'
)
const { projectCleanupReport } = await import(
  './browser-public-default-cleanup/project.mjs'
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
  directory = path.dirname(fileURLToPath(import.meta.url)),
  corpus = path.join(directory, 'browser-hook-parameters'),
  hash = (value) => createHash('sha256').update(value).digest('hex'),
  save = (where, name, value) =>
    fs.writeFileSync(
      path.join(where, name),
      JSON.stringify(value, null, 2) + '\n'
    ),
  insideConsumer = (where) => {
    const relative = path.relative(consumer, where)
    assert(
      !path.isAbsolute(relative) &&
        relative !== '..' &&
        !relative.startsWith('..' + path.sep),
      'Owned fixture paths must remain inside the consumer: ' + where
    )
  },
  inputPins = {},
  readFrozen = (relative, expectedSHA256) => {
    const file = path.join(corpus, relative),
      content = fs.readFileSync(file),
      actualSHA256 = hash(content)
    if (expectedSHA256 !== undefined)
      assert.equal(actualSHA256, expectedSHA256, relative)
    inputPins[relative] = actualSHA256
    return content
  },
  manifest = JSON.parse(readFrozen('corpus-manifest.json.txt')),
  authority = JSON.parse(
    readFrozen('FROZEN-CORPUS.json.txt', manifest.authoritySHA256)
  )
assert.equal(
  manifest.authoritySHA256,
  '9e4f46b6c139c9d19e8ae29f6e75da19105a66e2b5ea2b5c0fb1b33edd6ccf05'
)
assert.equal(manifest.inputs.length, 8)
assert.equal(manifest.profiles.length, 16)
assert.equal(authority.profiles.length, 16)
const inputs = new Map(
  manifest.inputs.map((input) => {
    const original = authority.inputs[input.original]
    assert(original, input.original)
    assert.equal(input.sha256, original.sha256)
    assert.equal(input.classification, original.classification)
    return [
      input.id,
      { ...input, content: readFrozen(input.file, input.sha256) },
    ]
  })
)
assert.equal(inputs.size, 8)
const profiles = manifest.profiles.map((profile) => {
  const input = inputs.get(profile.id)
  assert(input)
  assert.equal(profile.classification, input.classification)
  assert.equal(profile.sourceSHA256, input.sha256)
  const originals = authority.profiles.filter(
    (original) =>
      original.sourceSHA256 === profile.sourceSHA256 &&
      original.mode === profile.mode
  )
  assert.equal(originals.length, 1)
  const original = originals[0]
  assert.equal(profile.classification, original.classification)
  assert.equal(profile.sha256, original.projectionSHA256)
  assert.equal(profile.status, original.status)
  assert.equal(profile.rows, original.rows)
  assert.equal(profile.cases, original.cases)
  const reference = JSON.parse(readFrozen(profile.file, profile.sha256)),
    authored = JSON.parse(
      readFrozen(profile.authoredFile, profile.authoredSHA256)
    )
  assert.equal(authored.sourceSHA256, input.sha256)
  assert.equal(authored.cliDeadlineMs, 120000)
  assert.equal(reference.rows.length, profile.rows)
  assert.equal(reference.cases.length, profile.cases)
  assert.equal(reference.exit, profile.status)
  return { ...profile, input, reference, authored }
})
const modeProfiles = profiles.filter((profile) => profile.mode === mode)
assert.equal(modeProfiles.length, 8)
assert.equal(
  modeProfiles.filter((profile) => profile.classification.startsWith('valid-'))
    .length,
  4
)
assert.equal(
  modeProfiles
    .filter((profile) => profile.classification.startsWith('valid-'))
    .reduce((total, profile) => total + profile.rows, 0),
  17
)
assert.equal(
  modeProfiles.filter(
    (profile) => profile.classification === 'reference-registration-refusal'
  ).length,
  2
)
assert.equal(
  modeProfiles.filter(
    (profile) =>
      profile.classification === 'original-rejected-inline-default' ||
      profile.classification === 'rejected-parenthesized-default'
  ).length,
  2
)
// Keep every frozen input and reference, but execute only the four successful
// profiles qualified across the two modes. Error-origin and separate Suite
// identity contracts remain outside this maintained default.
const selected = modeProfiles.filter(
  (profile) => profile.classification === 'valid-success'
)
assert.equal(selected.length, 2)
assert.equal(
  selected.reduce((total, profile) => total + profile.rows, 0),
  11
)
const require = createRequire(path.join(consumer, 'package.json')),
  dependency = createRequire(path.join(dependencies, 'package.json')),
  next = fs.realpathSync(require.resolve('next/dist/bin/next')),
  nextPackage = fs.realpathSync(
    path.dirname(require.resolve('next/package.json'))
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
save(output, 'INPUTS-BEFORE.json', inputPins)
save(output, 'dependencies.json', {
  modules,
  compilerRoot: consumer,
  actualRuntimeRootsRecorded: true,
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
const runs = []
for (const profile of selected) {
  assert.equal(profile.classification, 'valid-success')
  const evidence = path.join(output, profile.id)
  fs.mkdirSync(evidence)
  const fixture = fs.realpathSync(
    fs.mkdtempSync(path.join(consumer, '.next-test-browser-hook-parameters-'))
  )
  insideConsumer(fixture)
  const sourceFile = path.join(fixture, 'fixtures.test.mjs')
  fs.writeFileSync(sourceFile, profile.input.content)
  fs.copyFileSync(
    path.join(directory, 'browser-public-default-cleanup/reporter.mjs'),
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
  if (dependencies === consumer)
    fs.symlinkSync(
      path.join(consumer, 'node_modules'),
      path.join(fixture, 'node_modules'),
      'dir'
    )
  else {
    fs.mkdirSync(path.join(fixture, 'node_modules'))
    fs.symlinkSync(
      nextPackage,
      path.join(fixture, 'node_modules', 'next'),
      'dir'
    )
    for (const [name, value] of Object.entries(modules))
      fs.symlinkSync(
        value.directory,
        path.join(fixture, 'node_modules', name),
        'dir'
      )
  }
  const test = structuredClone(profile.authored.test)
  assert.equal(Object.hasOwn(test, 'environment'), false)
  assert.equal(Object.hasOwn(test, 'mode'), false)
  assert.equal(test.maxWorkers, 1)
  assert.equal(test.testTimeout, 5000)
  assert.equal(test.hookTimeout, 5000)
  assert.deepEqual(test.include, ['fixtures.test.mjs'])
  assert.equal(test.browser.instances.length, 1)
  assert.equal(test.browser.instances[0].browser, 'chromium')
  assert.equal(Object.hasOwn(test.browser, 'provider'), false)
  test.environment = 'browser'
  test.mode = mode
  const { environment, mode: selectedMode, ...originalTest } = test
  assert.equal(environment, 'browser')
  assert.equal(selectedMode, mode)
  assert.deepEqual(originalTest, profile.authored.test)
  const configSource = 'export default ' + JSON.stringify({ test }) + '\n'
  fs.writeFileSync(
    path.join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root: consumer } }) + '\n'
  )
  fs.writeFileSync(path.join(fixture, 'next.test.config.mjs'), configSource)
  fs.writeFileSync(
    path.join(evidence, 'next.test.config.mjs.txt'),
    configSource
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
    id: profile.id,
    classification: profile.classification,
    mode,
    args,
    fixture,
    test,
    sourceSHA256: profile.sourceSHA256,
    referenceSHA256: profile.sha256,
    originalAuthoredSHA256: profile.authoredSHA256,
    compilerRoot: consumer,
    cliDeadlineMs: 120000,
    addedExecutionCarrierOnly: ['environment', 'mode'],
  })
  let joined = false
  let started = false
  try {
    const nativeCarrier = await prepareNativeCarrier(fixture)
    save(
      evidence,
      'native-carrier.json',
      nativeCarrier ?? { suppliedByHarness: false }
    )
    started = true
    const owner = await runOwnedNode(args, {
      cwd: fixture,
      env: {
        ...env,
        NODE_ENV: mode,
        ...(nativeCarrier
          ? { NEXT_TEST_NATIVE_DIR: nativeCarrier.directory }
          : {}),
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
      'Browser hook parameters ' + profile.id + ' ' + mode
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
    assert.equal(hash(fs.readFileSync(sourceFile)), profile.sourceSHA256)
    assert.equal(
      hash(fs.readFileSync(path.join(fixture, 'next.test.config.mjs'))),
      hash(configSource)
    )
    assert.equal(owner.status, profile.status)
    assert.equal(projection.exit, profile.status)
    assert.equal(projection.rows.length, profile.rows)
    assert.equal(projection.cases.length, profile.cases)
    assert.deepEqual(projection, profile.reference)
    assert.equal(report.numPassedTests, profile.cases)
    runs.push({
      id: profile.id,
      classification: profile.classification,
      mode,
      status: owner.status,
      cases: projection.cases.length,
      rows: projection.rows.length,
      allOwnersJoined: true,
    })
    save(output, 'PROGRESS.json', { completed: runs.length, runs })
  } finally {
    if (!started || joined) removeOwnedFixture(fixture)
    save(evidence, 'closure.json', {
      allOwnersJoined: joined,
      fixtureAbsent: !fs.existsSync(fixture),
    })
  }
}
for (const [relative, pin] of Object.entries(inputPins))
  assert.equal(hash(fs.readFileSync(path.join(corpus, relative))), pin)
for (const [name, pin] of Object.entries(graph))
  assert.equal(hash(fs.readFileSync(path.join(consumer, name))), pin)
assert.equal(runs.length, 2)
save(output, 'VERIFIED.json', {
  mode,
  selectedContract: 'qualified-success-only',
  profiles: runs.length,
  cases: runs.reduce((total, run) => total + run.cases, 0),
  rows: runs.reduce((total, run) => total + run.rows, 0),
  runs,
  completeGenuineSuccessModelsExact: true,
  errorProfilesQualified: false,
  suiteIdentitySourceQualified: false,
  frozenInputsHeld: true,
  graphPinsHeld: true,
  allOwnersJoined: true,
  allFixturesRemoved: true,
})
