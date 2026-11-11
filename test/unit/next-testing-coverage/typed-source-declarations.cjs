const { readCoverageFixture } = require('./coverage-fixtures.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
// This direct compiler helper owns its development profile, including in Jest.
process.env.NODE_ENV = 'development'
const [consumerArg, outputArg] = process.argv.slice(2)
assert(consumerArg && outputArg)
const consumer = path.resolve(consumerArg),
  output = path.resolve(outputArg)
const load = createRequire(path.join(consumer, 'package.json'))
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const nextRoot = path.dirname(load.resolve('next/package.json'))
require(path.join(nextRoot, 'dist/server/node-environment'))
const root = path.join(nextRoot, 'dist/experimental/testing')
const { createIstanbulSourcePlan, openIstanbulInstrumentation } = require(
  path.join(root, 'coverage/istanbul-instrumentation')
)
const {
  createRuntimeConfigurationPlan,
  prepareRuntimeConfigurationReceipt,
} = require(path.join(root, 'coverage/runtime-configuration'))
const { createTestCompilerSession } = require(path.join(root, 'compiler'))
const {
  readIstanbulCompilerDeclarations,
  readIstanbulRuntimeDeclarations,
  appendIstanbulDeclarations,
  assertIstanbulSourceDeclarations,
} = require(path.join(root, 'coverage/istanbul-typescript-parent'))
const { readIstanbulTypeScriptDeclarations } = require(
  path.join(root, 'coverage/istanbul-typescript-artifact')
)
const corpus = readCoverageFixture(
  path.join(__dirname, 'fixtures/istanbul-provider/typed-source-pristine.json')
)
const row = corpus.rows.find((row) => row.name === 'mjs-ts-explicit-true')
const fixture = fs.mkdtempSync(
  path.join(consumer, '.next-typed-source-declarations-')
)
fs.mkdirSync(output, { recursive: true })
const signal = new AbortController().signal
const profile = {
  id: 'typed-source-declarations',
  mode: 'development',
  environment: 'node',
  runtime: 'nodejs',
  bundler: 'turbopack',
}
const entry = {
  id: 'typed-source-case',
  file: path.join(fixture, row.specFile),
  profile,
}
const config = {
  provider: 'istanbul',
  formatterReports: true,
  reporter: ['json', 'json-summary', 'lcovonly'],
  include: [row.subjectFile],
  exclude: [],
  reportsDirectory: 'coverage',
  reportOnFailure: true,
  thresholds: {},
}
const checks = []
let session,
  service,
  ordinary,
  leaseOpen = true,
  closed = false
const clone = (value) => structuredClone(value)
function assertLease() {
  assert.equal(leaseOpen, true, 'actual source artifact lease closed')
}
async function refusal(name, action, pattern) {
  await assert.rejects(action, pattern)
  checks.push(name)
}
;(async () => {
  try {
    for (const [name, file] of Object.entries(row.sourceFiles))
      fs.writeFileSync(path.join(fixture, name), file)
    fs.writeFileSync(path.join(fixture, 'package.json'), '{"type":"module"}\n')
    fs.writeFileSync(
      path.join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({ turbopack: { root: consumer } }) +
        '\n'
    )
    const plan = await createIstanbulSourcePlan({
      projectDir: fixture,
      profile,
      config,
      excludedFiles: [entry.file],
      signal,
    })
    const configurationPlan = await createRuntimeConfigurationPlan({
      projectDir: fixture,
      projects: [{ profile, entries: [entry] }],
      signal,
    })
    service = await openIstanbulInstrumentation({
      projectDir: fixture,
      plan,
      signal,
    })
    assert.equal(typeof service.prepareTypeScript, 'function')
    session = await createTestCompilerSession(fixture, profile, {
      istanbulInstrumentation: service.descriptor,
      prepareIstanbulTypeScript: service.prepareTypeScript,
      readIstanbulInstrumentation: service.readMetadata,
    })
    const selected = plan.sources[0]
    const compiled = await session.compileCoverageSource(
      { file: selected.file, sha256: selected.sha256 },
      {
        signal,
        revision: selected.declarationRevision,
        configurationImports: configurationPlan.requests[0].authorization,
      }
    )
    const input = {
      compiled,
      projectDir: fixture,
      plan,
      configurationPlan,
      signal,
      assertLease,
    }
    const records = await readIstanbulCompilerDeclarations(input)
    assert.equal(records.length, 1)
    assert.deepEqual(
      Object.keys(records[0]).sort(),
      [
        'version',
        'profile',
        'owner',
        'source',
        'typeScriptSource',
        'initial',
      ].sort()
    )
    assert.deepEqual(records[0].owner, {
      kind: 'compiler-source',
      revision: selected.declarationRevision,
    })
    assert.equal(Object.hasOwn(records[0], 'complete'), false)
    assert.equal(Object.hasOwn(records[0], 'entryId'), false)
    checks.push('actual-source-only-no-runtime-completion')
    const publication = {
      declarations: records,
      projectDir: fixture,
      plan,
      expected: new Set([entry.id]),
      revisions: new Map([[entry.id, 'actual-runtime-revision']]),
      signal,
    }
    const declared = await assertIstanbulSourceDeclarations(publication)
    assert.equal(declared.sources.size, 1)
    assert.equal(declared.runtime.size, 0)
    checks.push('actual-source-only-zero-without-evaluation')
    await refusal(
      'missing-compiler-declaration',
      () =>
        assertIstanbulSourceDeclarations({ ...publication, declarations: [] }),
      /omitted its actual compiler declarations/
    )
    await refusal(
      'closed-lease',
      () =>
        readIstanbulCompilerDeclarations({
          ...input,
          assertLease() {
            throw new Error('actual source artifact lease closed')
          },
        }),
      /lease closed/
    )
    const foreignRevision = clone(compiled)
    foreignRevision.artifact.revision = 'foreign-revision'
    await refusal(
      'foreign-source-revision',
      () =>
        readIstanbulCompilerDeclarations({
          ...input,
          compiled: foreignRevision,
        }),
      /exact parent request/
    )
    const foreignSource = clone(compiled)
    foreignSource.source.sha256 = '0'.repeat(64)
    await refusal(
      'foreign-source-bytes',
      () =>
        readIstanbulCompilerDeclarations({ ...input, compiled: foreignSource }),
      /exact parent request/
    )
    const foreignProfile = clone(compiled)
    foreignProfile.artifact.profile.id = 'foreign-profile'
    await refusal(
      'foreign-profile',
      () =>
        readIstanbulCompilerDeclarations({
          ...input,
          compiled: foreignProfile,
        }),
      /proof|owner|profile|declarations/i
    )
    const foreignConfig = clone(configurationPlan)
    foreignConfig.requests[0].authorization.id = 'foreign-config'
    await refusal(
      'foreign-original-config-request',
      () =>
        readIstanbulCompilerDeclarations({
          ...input,
          configurationPlan: foreignConfig,
        }),
      /proof|config/i
    )
    const absentLiteral = clone(compiled)
    absentLiteral.artifact.coverage.scripts = []
    await refusal(
      'missing-real-literal',
      () =>
        readIstanbulCompilerDeclarations({ ...input, compiled: absentLiteral }),
      /missing or ambiguous/
    )
    const ambiguous = clone(compiled)
    ambiguous.artifact.coverage.scripts.push(
      ...clone(ambiguous.artifact.coverage.scripts)
    )
    await refusal(
      'duplicate-real-counter-scope',
      () => readIstanbulCompilerDeclarations({ ...input, compiled: ambiguous }),
      /missing or ambiguous/
    )
    const typedSource = compiled.artifact.coverage.istanbul.sources.find(
      (source) => source.typeScriptSource
    )
    const tuple = clone(typedSource)
    tuple.typeScriptSource.code += '\nfunction foreign() { return 1 }\n'
    await refusal(
      'foreign-lowering-tuple',
      () =>
        readIstanbulTypeScriptDeclarations({
          artifact: compiled.artifact,
          source: tuple,
          projectDir: fixture,
          profile,
          owner: records[0].owner,
          signal,
          assertLease,
        }),
      /actual artifact owner/
    )
    const badMap = clone(compiled)
    badMap.artifact.coverage.istanbul.sources[0].typeScriptSource.inputSourceMap.sourcesContent[0] +=
      '\n'
    await refusal(
      'foreign-input-map',
      () => readIstanbulCompilerDeclarations({ ...input, compiled: badMap }),
      /declarations differ|source.map|template|instrumenter/i
    )
    const target = []
    appendIstanbulDeclarations(target, records)
    assert.throws(
      () => appendIstanbulDeclarations(target, records),
      /Duplicate/
    )
    checks.push('duplicate-parent-owner')
    const conflict = clone(records[0])
    conflict.owner.revision = 'other-owner'
    conflict.initial.f[Object.keys(conflict.initial.f)[0]] = 1
    assert.throws(
      () => appendIstanbulDeclarations(target, [conflict]),
      /Conflicting/
    )
    checks.push('conflicting-actual-declarations')
    const wrongOwner = clone(records)
    wrongOwner[0].owner.revision = 'foreign-source'
    await refusal(
      'foreign-publication-owner',
      () =>
        assertIstanbulSourceDeclarations({
          ...publication,
          declarations: wrongOwner,
        }),
      /Unrequested/
    )
    const runtime = clone(records)
    runtime[0].owner = {
      kind: 'runtime-entry',
      entryId: 'foreign-entry',
      revision: 'actual-runtime-revision',
    }
    await refusal(
      'foreign-runtime-entry',
      () =>
        assertIstanbulSourceDeclarations({
          ...publication,
          declarations: runtime,
        }),
      /Unrequested/
    )
    const unsupported = clone(plan)
    unsupported.sources = []
    await refusal(
      'unsolicited-parent-declaration',
      () =>
        assertIstanbulSourceDeclarations({ ...publication, plan: unsupported }),
      /Unrequested/
    )
    const authored = fs.readFileSync(selected.file)
    try {
      fs.appendFileSync(selected.file, '\n// concurrent source edit\n')
      await refusal(
        'raw-source-mutated-after-lowering',
        () => readIstanbulCompilerDeclarations(input),
        /changed|declarations|syntax/i
      )
    } finally {
      fs.writeFileSync(selected.file, authored)
    }
    const script = compiled.artifact.coverage.scripts.find((script) => {
      const code = fs.readFileSync(
        path.join(compiled.artifact.rootDir, script.path),
        'utf8'
      )
      return (
        code.includes('_coverageSchema') && code.includes('function choose(')
      )
    })
    assert(script)
    const scriptFile = path.join(compiled.artifact.rootDir, script.path),
      emitted = fs.readFileSync(scriptFile)
    try {
      fs.appendFileSync(scriptFile, '\n// changed emitted counter scope\n')
      await refusal(
        'actual-emitted-script-mutation',
        () => readIstanbulCompilerDeclarations(input),
        /emitted script changed/
      )
    } finally {
      fs.writeFileSync(scriptFile, emitted)
    }
    fs.writeFileSync(
      path.join(fixture, 'ordinary.mjs'),
      'export function ordinary() { return 1 }\n'
    )
    const ordinaryPlan = await createIstanbulSourcePlan({
      projectDir: fixture,
      profile,
      config: { ...config, include: ['ordinary.mjs'] },
      excludedFiles: [],
      signal,
    })
    ordinary = await openIstanbulInstrumentation({
      projectDir: fixture,
      plan: ordinaryPlan,
      signal,
    })
    assert.deepEqual(Object.keys(ordinary).sort(), ['descriptor', 'dispose'])
    assert.equal(
      Object.hasOwn(
        ordinary.descriptor.metadata.sources[0],
        'typeScriptSource'
      ),
      false
    )
    checks.push('ordinary-js-absence-shape')
    const final = await readIstanbulCompilerDeclarations(input)
    assert.deepEqual(final, records)
    checks.push('original-artifact-and-source-restored-exactly')
    const runtimeEntry = configurationPlan.requests[0].entries[0]
    const runtimeArtifact = await session.compile(entry, {
      signal,
      coverage: { version: 1, kind: 'node-istanbul' },
      runtimeConfigurationImports: {
        authorization: configurationPlan.requests[0].authorization,
        entry: runtimeEntry,
      },
    })
    const runtimeRecords = await readIstanbulRuntimeDeclarations({
      artifact: runtimeArtifact,
      entry,
      projectDir: fixture,
      plan,
      signal,
      assertLease,
    })
    assert.equal(runtimeRecords.length, 1)
    const combined = []
    appendIstanbulDeclarations(combined, records)
    appendIstanbulDeclarations(combined, runtimeRecords)
    const staged = await prepareRuntimeConfigurationReceipt({
      artifact: runtimeArtifact,
      plan: configurationPlan,
      artifactRoot: runtimeArtifact.rootDir,
      signal,
    })
    const { executeWithEnvironment } = require(
      path.join(root, 'execution/execute')
    )
    const { remapIstanbulCapture } = require(
      path.join(root, 'coverage/istanbul-capture')
    )
    const { publishIstanbulCoverage } = require(
      path.join(root, 'coverage/report-istanbul')
    )
    const facts = []
    const result = await executeWithEnvironment(runtimeArtifact, {
      runId: require('node:crypto').randomUUID(),
      signal,
      projectDir: fixture,
      entry,
      setupFiles: [],
      snapshotSerializers: [],
      snapshotUpdateMode: 'none',
      coverage: { version: 1, kind: 'node-istanbul' },
      onEvent() {},
      onIstanbulCoverage: async (completion) => {
        assert.equal(completion.complete, true)
        facts.push(
          await remapIstanbulCapture(
            runtimeArtifact,
            completion.data,
            fixture,
            signal
          )
        )
      },
    })
    assert.equal(result.status, 'passed')
    assert.equal(facts.length, 1)
    const receipt = await staged.seal()
    const publish = {
      projectDir: fixture,
      facts,
      plan,
      declarations: combined,
      runtimeConfiguration: { plan: configurationPlan, receipts: [receipt] },
      expected: new Set([entry.id]),
      config,
      status: 'passed',
      signal,
      prepareOnly: true,
      onCoverageMap() {},
    }
    await publishIstanbulCoverage(publish)
    checks.push('actual-runtime-capture-and-original-config-seal')
    const missingReceipt = {
      ...publish,
      runtimeConfiguration: { plan: configurationPlan, receipts: [] },
    }
    await refusal(
      'typed-runtime-without-config-receipt',
      () => publishIstanbulCoverage(missingReceipt),
      /configuration receipt/
    )
    const configFile = path.join(fixture, 'next.config.mjs'),
      originalConfig = fs.readFileSync(configFile)
    try {
      fs.appendFileSync(
        configFile,
        '\n// compiler input changed after execution\n'
      )
      await refusal(
        'config-edit-after-real-seal-before-map',
        () => publishIstanbulCoverage(publish),
        /changed|config|input/i
      )
    } finally {
      fs.writeFileSync(configFile, originalConfig)
    }
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const late = path.join(fixture, name)
      try {
        fs.writeFileSync(late, '{}\n', { flag: 'wx' })
        await refusal(
          'late-' + name + '-before-publication',
          () => publishIstanbulCoverage(publish),
          /config|input|inventory/i
        )
      } finally {
        fs.rmSync(late, { force: true })
      }
    }
    const badFacts = clone(facts),
      badFile = badFacts[0].files[0]
    badFile.data.s[Object.keys(badFile.data.s)[0]] = -1
    await refusal(
      'typed-runtime-invalid-count',
      () => publishIstanbulCoverage({ ...publish, facts: badFacts }),
      /Invalid Istanbul mapped counters/
    )
    await publishIstanbulCoverage(publish)
    assert.equal(fs.existsSync(path.join(fixture, 'coverage')), false)
    checks.push('restored-inputs-prepare-only-no-report-files')
    fs.writeFileSync(
      path.join(output, 'CHECKS.json'),
      JSON.stringify(
        {
          checks,
          count: checks.length,
          sourceOnlyRecordsDoNotGrantExecution: true,
          actualCompilerAndOriginalConfiguration: true,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    leaseOpen = false
    try {
      await session?.dispose()
    } finally {
      await service?.dispose()
      await ordinary?.dispose()
    }
    closed = true
    fs.rmSync(fixture, { recursive: true, force: true })
    fs.writeFileSync(
      path.join(output, 'CLOSED.json'),
      JSON.stringify({ closed, fixtureRetired: !fs.existsSync(fixture) }) + '\n'
    )
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
