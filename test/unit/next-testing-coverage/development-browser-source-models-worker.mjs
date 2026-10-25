import assert from 'node:assert/strict'
import { serialize } from 'node:v8'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
const [repo, fixture, out, referenceFile] = process.argv.slice(2),
  require = createRequire(join(repo, 'package.json')),
  reference = JSON.parse(readFileSync(referenceFile, 'utf8'))
const { parse } = require('next/dist/compiled/acorn')
const producerFacts = []
function inspectProducer(artifact, file, label) {
  const mappedSources = (map) =>
    map.sections
      ? map.sections.flatMap((section) => mappedSources(section.map))
      : (map.sources ?? [])
  const selected = artifact.coverage.scripts.filter(
    (script) =>
      script.mapPath &&
      mappedSources(
        JSON.parse(readFileSync(join(artifact.rootDir, script.mapPath), 'utf8'))
      ).some((source) => source.endsWith('/' + basename(file)))
  )
  assert(selected.length > 0)
  for (const script of selected) {
    const bytes = readFileSync(join(artifact.rootDir, script.path))
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      script.sha256
    )
    const ast = parse(bytes.toString('utf8'), {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
      }),
      refresh = [],
      jsx = []
    function visit(value) {
      if (!value || typeof value !== 'object') return
      if (value.type === 'CallExpression') {
        const c = value.callee
        if (
          c?.type === 'MemberExpression' &&
          c.object?.type === 'MemberExpression' &&
          c.object.object?.type === 'Identifier' &&
          c.object.object.name === '__turbopack_context__' &&
          c.object.property?.name === 'k' &&
          ['register', 'registerExports', 'signature'].includes(
            c.property?.name
          )
        )
          refresh.push({ type: c.property.name, loc: value.loc })
        if (
          c?.type === 'SequenceExpression' &&
          c.expressions?.[1]?.type === 'MemberExpression' &&
          c.expressions[1].property?.value === 'jsxDEV'
        )
          jsx.push({ loc: value.loc, arguments: value.arguments.length })
      }
      for (const [key, child] of Object.entries(value))
        if (key !== 'loc')
          Array.isArray(child) ? child.forEach(visit) : visit(child)
    }
    visit(ast)
    producerFacts.push({
      label,
      source: file,
      revision: artifact.revision,
      mode: artifact.profile.mode,
      nativeVersion: artifact.coverage.browser.version,
      script: script.path,
      sha256: script.sha256,
      refresh,
      jsx,
    })
    assert.deepEqual(
      refresh,
      [],
      'Actual test graph must omit producer Refresh calls'
    )
    assert(jsx.length > 0, 'Actual development JSX calls retained')
    assert(
      jsx.every((call) => call.arguments === 6),
      'Actual development jsxDEV arguments retained'
    )
  }
  writeFileSync(
    join(out, 'PRODUCER-ACTUAL.json'),
    JSON.stringify(producerFacts, null, 2) + '\n'
  )
}
const {
    createTestCompilerSession,
  } = require('next/dist/experimental/testing/compiler'),
  {
    createCoverageSourcePlan,
  } = require('next/dist/experimental/testing/coverage/source-analysis-plan'),
  configuration = require('next/dist/experimental/testing/coverage/runtime-configuration'),
  {
    analyzeCompiledBrowserCoverageSource,
  } = require('next/dist/experimental/testing/coverage/browser-source-analysis'),
  { executeClient } = require('next/dist/experimental/testing/client/execute'),
  {
    remapPlannedBrowserStandardCoverage,
  } = require('next/dist/experimental/testing/coverage/istanbul'),
  {
    publishStandardCoverage,
  } = require('next/dist/experimental/testing/coverage/report-standard'),
  {
    parseProjectStandardCoverage,
  } = require('next/dist/experimental/testing/coverage/options')
const profile = {
    id: 'development-jsx-private',
    mode: 'development',
    environment: 'browser',
    runtime: 'nodejs',
    bundler: 'turbopack',
    browserClient: true,
  },
  entry = {
    id: 'development-jsx:contract.test.mjs',
    file: join(fixture, 'contract.test.mjs'),
    profile,
  },
  project = {
    profile,
    entries: [entry],
    include: ['contract.test.mjs'],
    exclude: [],
    setupFiles: [],
  },
  coverage = { version: 1, kind: 'browser-v8' },
  signal = new AbortController().signal,
  events = [],
  save = (name, value) =>
    writeFileSync(
      join(out, name + '.json'),
      JSON.stringify(value, null, 2) + '\n'
    ),
  canonical = (files) =>
    JSON.parse(
      JSON.stringify(
        Object.fromEntries(
          files.map(({ file, data }) => [
            basename(file),
            { ...data, path: basename(file) },
          ])
        )
      )
    )
const config = parseProjectStandardCoverage({
  provider: 'v8',
  enabled: true,
  include: Object.keys(reference.coverage),
  exclude: [],
  reporter: ['json'],
  reportsDirectory: '.private-development-jsx-report',
  thresholds: {},
  reportOnFailure: true,
}).options
let compiler,
  disposed = false,
  phase = 'source-plan'
const assertLease = () => {
  signal.throwIfAborted()
  assert.equal(disposed, false)
}
try {
  const sourcePlan = await createCoverageSourcePlan({
      projectDir: fixture,
      projects: [project],
      config,
      signal,
    }),
    runtimePlan = await configuration.createRuntimeConfigurationPlan({
      projectDir: fixture,
      projects: [project],
      signal,
    })
  save('source-plan', sourcePlan)
  save('runtime-plan', runtimePlan)
  assert.equal(sourcePlan.requests.length, 2)
  compiler = await createTestCompilerSession(fixture, profile, {
    browserCoverageDeclarations: true,
    browserDevelopmentImportPlan: sourcePlan,
  })
  const declarations = []
  for (const request of sourcePlan.requests) {
    phase = 'declaration-compile:' + basename(request.source.file)
    const compiled = await compiler.compileCoverageSource(request.source, {
      signal,
      revision: request.revision,
      configurationImports: request.configurationImports,
    })
    assert.equal(compiled.artifact.coverage.browser.version, 1)
    save('declaration-artifact-' + declarations.length, compiled.artifact)
    const bytes = readFileSync(
      join(
        compiled.artifact.rootDir,
        compiled.artifact.coverage.browser.nativeMetadata.path
      )
    )
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      compiled.artifact.coverage.browser.nativeMetadata.sha256
    )
    const native = JSON.parse(bytes)
    assert.equal(native.version, 1)
    assert.equal(native.importInitializers, undefined)
    assert.equal(native.developmentImports?.version, 1)
    assert.equal(native.developmentImports?.mode, 'development')
    assert(Object.keys(native.developmentImports.sectionsByScript).length > 0)
    assert.deepEqual(compiled.artifact.coverage.browser.developmentImports, {
      version: 1,
      mode: 'development',
    })
    save('declaration-native-' + declarations.length, native)
    const captured = []
    const mappedSources = (map) =>
      map.sections
        ? map.sections.flatMap((section) => mappedSources(section.map))
        : (map.sources ?? [])
    for (const script of compiled.artifact.coverage.scripts) {
      if (!script.mapPath) continue
      const raw = readFileSync(join(compiled.artifact.rootDir, script.mapPath))
      const map = JSON.parse(raw)
      if (
        !mappedSources(map).some((source) =>
          source.endsWith('/' + basename(request.source.file))
        )
      )
        continue
      for (const path of [script.path, script.mapPath]) {
        const source = join(compiled.artifact.rootDir, path),
          target = join(out, 'retained', path)
        mkdirSync(dirname(target), { recursive: true })
        copyFileSync(source, target)
        captured.push({
          path,
          sha256: createHash('sha256')
            .update(readFileSync(source))
            .digest('hex'),
        })
      }
    }
    save('captured-' + declarations.length, {
      request,
      files: captured,
      source: readFileSync(request.source.file, 'utf8'),
    })
    phase = 'producer-actual:' + basename(request.source.file)
    inspectProducer(compiled.artifact, request.source.file, 'declaration')
    const expectedDeclaration = {
      projectDir: fixture,
      artifactRoot: compiled.artifact.rootDir,
      revision: request.revision,
      profile,
      source: request.source,
      configurationImports: request.configurationImports,
      assertLease,
    }
    phase = 'declaration-boundaries:' + basename(request.source.file)
    await assert.rejects(
      analyzeCompiledBrowserCoverageSource(
        compiled,
        { ...expectedDeclaration, profile: { ...profile, mode: 'production' } },
        signal
      ),
      /Unrequested or incompatible Browser compiler declaration analysis/
    )
    await assert.rejects(
      analyzeCompiledBrowserCoverageSource(
        compiled,
        { ...expectedDeclaration, revision: randomUUID() },
        signal
      ),
      /Unrequested or incompatible Browser compiler declaration analysis/
    )
    await assert.rejects(
      analyzeCompiledBrowserCoverageSource(
        compiled,
        {
          ...expectedDeclaration,
          source: {
            ...request.source,
            file: join(
              fixture,
              'foreign-source' + basename(request.source.file)
            ),
          },
        },
        signal
      ),
      /Unrequested or incompatible Browser compiler declaration analysis/
    )
    await assert.rejects(
      analyzeCompiledBrowserCoverageSource(
        compiled,
        {
          ...expectedDeclaration,
          assertLease() {
            return 'closed'
          },
        },
        signal
      ),
      /lost its parent lease/
    )

    if (declarations.length === 0) {
      phase = 'actual-development-jsx-call-negative-controls'
      const {
        prepareBrowserImportInitializers,
      } = require('next/dist/experimental/testing/coverage/browser-imports')
      const owned = Object.entries(
        native.developmentImports.sectionsByScript
      ).find(([, sections]) =>
        sections.some(
          (section) => section.data.issuer.sha256 === request.source.sha256
        )
      )
      assert(owned)
      const metadata = compiled.artifact.coverage.scripts.find(
        (script) => script.path === owned[0]
      )
      assert(metadata?.mapPath)
      const code = readFileSync(
          join(compiled.artifact.rootDir, metadata.path),
          'utf8'
        ),
        rawMap = JSON.parse(
          readFileSync(
            join(compiled.artifact.rootDir, metadata.mapPath),
            'utf8'
          )
        )
      const role = owned[1]
        .find((section) => section.data.issuer.sha256 === request.source.sha256)
        .data.roles.find((role) => role.request === 'react/jsx-dev-runtime')
      assert(role)
      const controls = []
      for (const name of [
        'arity',
        'namespace',
        'fragment',
        'duplicate-owner',
        'source-owner',
        'mode',
        'filename',
      ]) {
        const ast = parse(code, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            locations: true,
          }),
          members = [],
          calls = []
        function walk(value) {
          if (!value || typeof value !== 'object') return
          if (
            value.type === 'MemberExpression' &&
            value.object?.type === 'Identifier' &&
            value.object.name === role.binding
          )
            members.push(value)
          if (
            value.type === 'CallExpression' &&
            value.callee?.type === 'SequenceExpression' &&
            value.callee.expressions.at(-1)?.object?.name === role.binding &&
            value.callee.expressions.at(-1)?.property?.value === 'jsxDEV'
          )
            calls.push(value)
          for (const [key, child] of Object.entries(value))
            if (key !== 'loc')
              Array.isArray(child) ? child.forEach(walk) : walk(child)
        }
        walk(ast)
        assert(calls.length)
        const field = (call, key) =>
          call.arguments[4].properties.find(
            (property) => property.key.name === key
          ).value
        let targetArtifact = compiled.artifact
        if (name === 'arity') calls[0].arguments.pop()
        if (name === 'namespace')
          for (const member of members) member.object.name += '__foreign'
        if (name === 'fragment') {
          const call = calls.find(
            (call) =>
              call.arguments[0].type === 'MemberExpression' &&
              call.arguments[0].property?.value === 'Fragment'
          )
          if (!call) continue
          call.arguments[0].object.name += '__foreign'
        }
        if (name === 'duplicate-owner') {
          const elements = calls.filter(
            (call) => call.arguments[0].type !== 'MemberExpression'
          )
          if (elements.length < 2) continue
          elements[0].arguments[4] = structuredClone(elements[1].arguments[4])
        }
        if (name === 'source-owner')
          field(calls[0], 'lineNumber').value += 100000
        if (name === 'mode')
          targetArtifact = {
            ...compiled.artifact,
            profile: { ...profile, mode: 'production' },
          }
        if (name === 'filename')
          field(calls[0], 'fileName').value =
            '[project]/foreign/' + basename(request.source.file)
        await assert.rejects(
          prepareBrowserImportInitializers({
            artifact: targetArtifact,
            metadata,
            code,
            rawMap,
            ast,
            selectedSources: new Map([
              [request.source.file, readFileSync(request.source.file, 'utf8')],
            ]),
            async generatedCoverage() {
              throw new Error('NEGATIVE_AST_REACHED_COUNTERS')
            },
          }),
          /Unsupported or ambiguous native Browser import coverage ownership/
        )
        controls.push(name)
      }
      save('development-jsx-negative-controls', controls)
      assert.equal(controls.length, reference.kind === 'tsx' ? 7 : 5)
    }
    phase = 'declaration-analyze:' + basename(request.source.file)
    const fact = await analyzeCompiledBrowserCoverageSource(
      compiled,
      {
        projectDir: fixture,
        artifactRoot: compiled.artifact.rootDir,
        revision: request.revision,
        profile,
        source: request.source,
        configurationImports: request.configurationImports,
        assertLease,
      },
      signal
    )
    save('declaration-data-' + declarations.length, fact)
    writeFileSync(
      join(out, 'declaration-data-' + declarations.length + '.v8'),
      serialize(fact)
    )
    assert.deepEqual(fact, structuredClone(fact))
    assert(fact.data.meta.fnNames instanceof Map)
    const expected = structuredClone(
      reference.coverage[basename(request.source.file)]
    )
    for (const key of ['s', 'f'])
      for (const id of Object.keys(expected[key])) expected[key][id] = 0
    for (const id of Object.keys(expected.b))
      expected.b[id] = expected.b[id].map(() => 0)
    const actual = JSON.parse(
      JSON.stringify({ ...fact.data, path: basename(fact.data.path) })
    )
    save('declaration-actual-' + declarations.length, actual)
    save('declaration-reference-zero-' + declarations.length, expected)
    phase = 'declaration-whole-equality:' + basename(request.source.file)
    assert.deepEqual(actual, expected)
    declarations.push(fact)
  }
  phase = 'runtime-compile'
  const request = runtimePlan.requests[0],
    artifact = await compiler.compile(entry, {
      signal,
      coverage,
      runtimeConfigurationImports: {
        authorization: request.authorization,
        entry: request.entries[0],
      },
    })
  assert.equal(artifact.coverage.browser.version, 1)
  save('artifact', artifact)
  phase = 'runtime-producer'
  inspectProducer(
    artifact,
    join(
      fixture,
      Object.keys(reference.coverage).find((name) =>
        name.startsWith('subject.')
      )
    ),
    'runtime'
  )
  await compiler.shutdownCompilation()
  const staged = await configuration.prepareRuntimeConfigurationReceipt({
    artifact,
    plan: runtimePlan,
    artifactRoot: artifact.rootDir,
    signal,
  })
  let converted = false
  const result = await executeClient(artifact, {
    entry,
    runId: randomUUID(),
    projectDir: fixture,
    setupFiles: [],
    signal,
    testFrame: false,
    browserEngine: 'chromium',
    browserViewport: { width: 640, height: 480 },
    coverage,
    captureTaskResults: true,
    snapshotUpdateMode: 'none',
    testTimeout: 5000,
    hookTimeout: 10000,
    fileTimeout: 60000,
    onEvent(event) {
      events.push(event)
    },
    async onCoverage(completion) {
      phase = 'runtime-remap'
      save('raw-capture', completion)
      const receipt = await staged.seal(),
        expectedRuntime = {
          runId: completion.runId,
          entry,
          sourcePlan,
          sourceDeclarations: declarations,
          runtimeConfigurationPlan: runtimePlan,
          runtimeConfigurationReceipt: receipt,
          assertLease,
        }
      await assert.rejects(
        remapPlannedBrowserStandardCoverage(
          artifact,
          { ...completion, revision: randomUUID() },
          expectedRuntime,
          signal
        ),
        /Mismatched test worker coverage completion/
      )
      await assert.rejects(
        remapPlannedBrowserStandardCoverage(
          { ...artifact, profile: { ...profile, mode: 'production' } },
          completion,
          expectedRuntime,
          signal
        ),
        /Incompatible planned Browser coverage artifact/
      )
      await assert.rejects(
        remapPlannedBrowserStandardCoverage(
          artifact,
          completion,
          {
            ...expectedRuntime,
            entry: { ...entry, file: join(fixture, 'foreign-entry.mjs') },
          },
          signal
        ),
        /Incompatible planned Browser coverage artifact/
      )
      const standard = await remapPlannedBrowserStandardCoverage(
        artifact,
        completion,
        {
          runId: completion.runId,
          entry,
          sourcePlan,
          sourceDeclarations: declarations,
          runtimeConfigurationPlan: runtimePlan,
          runtimeConfigurationReceipt: receipt,
          assertLease,
        },
        signal
      )
      save('standard', standard)
      writeFileSync(join(out, 'standard.v8'), serialize(standard))
      const actual = canonical(standard.files),
        expected = Object.fromEntries(
          Object.entries(reference.coverage).filter(
            ([name]) => !name.startsWith('unimported.')
          )
        )
      save('runtime-actual', actual)
      save('runtime-reference', expected)
      phase = 'runtime-whole-equality'
      assert.deepEqual(actual, expected)
      const publication = await publishStandardCoverage({
        projectDir: fixture,
        facts: [standard],
        expected: new Set([artifact.entryId]),
        excludedFiles: [],
        config,
        status: 'passed',
        includeUnimported: true,
        sourceAnalysis: { facts: declarations, plan: sourcePlan },
        runtimeConfiguration: { receipts: [receipt], plan: runtimePlan },
        signal,
      })
      save('publication', publication)
      assert.equal(publication.published, true)
      assert.deepEqual(publication.thresholdErrors, [])
      const full = JSON.parse(
          readFileSync(
            join(fixture, config.reportsDirectory, 'coverage-final.json'),
            'utf8'
          )
        ),
        canonicalFull = Object.fromEntries(
          Object.entries(full).map(([file, data]) => [
            basename(file),
            { ...data, path: basename(file) },
          ])
        )
      save('published-actual', canonicalFull)
      phase = 'published-whole-equality'
      assert.deepEqual(canonicalFull, reference.coverage)
      converted = true
    },
  })
  save('events', events)
  save('result', result)
  assert.equal(result.status, 'passed')
  assert(converted)
  assert.equal(
    events.filter((x) => x.type === 'case-end' && x.status === 'passed').length,
    reference.numPassedTests
  )
  const {
    createMachineReporter,
  } = require('next/dist/experimental/testing/reporting/machine')
  const reporter = createMachineReporter({
    projectDir: fixture,
    reporters: ['json'],
    write() {},
  })
  await reporter.initialize()
  try {
    for (const event of events) reporter.onEvent(event)
    const report = reporter.getJson()
    save('actual-case-report', report)
    const fields = [
      'ancestorTitles',
      'fullName',
      'status',
      'title',
      'failureMessages',
      'meta',
      'tags',
      'benchmarks',
    ]
    const actualCases = report.testResults.map((file) => ({
      file: basename(file.name),
      status: file.status,
      cases: file.assertionResults.map((test) =>
        Object.fromEntries(
          fields
            .filter((field) => field in test)
            .map((field) => [field, test[field]])
        )
      ),
    }))
    assert.deepEqual(actualCases, reference.cases)
  } finally {
    await reporter.dispose()
  }
  save('CHECKS', {
    status: 'private whole declaration/runtime/published data equal',
    declarations: declarations.length,
    cases: reference.numPassedTests,
    nativeVersion: 1,
    importInitializerAuthorityBorrowed: false,
  })
  console.log(
    JSON.stringify({
      status: 'passed',
      declarations: declarations.length,
      cases: reference.numPassedTests,
      nativeVersion: 1,
    })
  )
} catch (error) {
  save('FAILURE', {
    phase,
    message: String(error?.message ?? error),
    stack: error?.stack,
  })
  throw error
} finally {
  disposed = true
  await compiler?.dispose()
}
