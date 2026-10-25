import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
} from 'node:fs'
import { join, basename } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
const [consumer, fixture, destination, referenceFile, sdk] =
  process.argv.slice(2)
const require = createRequire(join(consumer, 'package.json'))
const projectRequire = createRequire(join(fixture, 'package.json'))
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name))
assert.equal(projectRequire('playwright/package.json').version, sdk)
const {
  createTestCompilerSession,
} = require('next/dist/experimental/testing/compiler')
const {
  executeClient,
} = require('next/dist/experimental/testing/client/execute')
const {
  remapCoverage,
} = require('next/dist/experimental/testing/coverage/remap')
const {
  remapStandardCoverage,
  remapPlannedBrowserStandardCoverage,
} = require('next/dist/experimental/testing/coverage/istanbul')
const {
  publishStandardCoverage,
} = require('next/dist/experimental/testing/coverage/report-standard')
const {
  createMachineReporter,
} = require('next/dist/experimental/testing/reporting/machine')
const reference = JSON.parse(readFileSync(referenceFile, 'utf8'))
assert.equal(reference.mode, 'production')
assert(reference.sdks.includes(sdk))
const browserJsx = Object.keys(reference.coverage).some((file) =>
  /\.[jt]sx$/.test(file)
)
const includeUnimported = reference.includeUnimported === true
const typedWithoutJsx = reference.sourceSyntax === 'typescript-without-jsx'
const classicJsx = reference.sourceSyntax === 'classic-jsx'
const automaticJsx = reference.sourceSyntax === 'automatic-jsx-without-react'
const namedClassicJsx = reference.sourceSyntax === 'named-classic-jsx'
const namedFragmentJsx = reference.sourceSyntax === 'named-classic-fragment'
const namedChildShapesJsx = reference.sourceSyntax === 'named-jsx-child-shapes'
const childShapesJsx =
  reference.sourceSyntax === 'jsx-child-shapes' || namedChildShapesJsx
const creatorScopesJsx = reference.sourceSyntax === 'native-creator-scopes'
const declarationDto =
  creatorScopesJsx ||
  typedWithoutJsx ||
  classicJsx ||
  automaticJsx ||
  namedClassicJsx ||
  namedFragmentJsx ||
  childShapesJsx
const runtimeFiles = Object.keys(reference.coverage).filter(
  (file) => !reference.unimportedFiles?.includes(file)
)
// The genuine reporter uses the fixture as cwd, including relative LCOV paths.
if (includeUnimported) process.chdir(fixture)
const rawConfig = {
  provider: 'v8',
  enabled: true,
  reporter: reference.reporters ?? ['json'],
  include: Object.keys(reference.coverage),
  exclude: [],
  reportsDirectory: '.production-coverage',
  reportOnFailure: true,
  thresholds: reference.thresholds ?? {},
}
const coverageConfig = includeUnimported
  ? require('next/dist/experimental/testing/coverage/options').parseProjectStandardCoverage(
      rawConfig
    ).options
  : rawConfig
const profile = {
  id: 'production-browser-coverage',
  mode: 'production',
  environment: 'browser',
  runtime: 'nodejs',
  bundler: 'turbopack',
  browserClient: true,
}
const entry = {
  id: 'coverage-original',
  file: join(fixture, reference.cases[0].file),
  profile,
}
const coverage = { version: 1, kind: 'browser-v8' },
  events = [],
  completions = []
const save = (name, value) =>
  writeFileSync(
    join(destination, name + '.json'),
    JSON.stringify(value, null, 2) + '\n'
  )
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const before = Object.fromEntries(
  Object.keys(reference.sourceFiles).map((name) => [
    name,
    hash(join(fixture, name)),
  ])
)
for (const [name, source] of Object.entries(reference.sourceFiles))
  assert.equal(before[name], source.sha256)
let compiler,
  disposed = false
const declarationOwnership = [],
  declarationMutationVetoes = []
function assertCreatorNativeOwner(owned) {
  assert.equal(owned.length, 1)
  const bridge = owned[0].section.data.roles.filter(
    (role) => role.request === 'private-next-test-creator-scope'
  )
  assert.equal(bridge.length, 1)
  assert.equal(bridge[0].resolvedFormat, 'commonjs')
  assert.equal(bridge[0].imports.length, 1)
  assert.equal(bridge[0].imports[0].origin, 'generated')
  assert.deepEqual(
    bridge[0].imports[0].specifiers.map((value) => [
      value.kind,
      value.imported,
    ]),
    [
      ['named', 'captureCreatorScope'],
      ['named', 'enterCreatorScope'],
    ]
  )
}
function assertNamedFragmentNativeOwner(owned) {
  assert.equal(owned.length, 1)
  const roles = owned[0].section.data.roles
  assert.equal(roles.length, 1)
  const role = roles[0]
  assert.equal(role.request, 'react')
  assert.equal(role.resolvedFormat, 'commonjs')
  assert.equal(role.imports.length, 1)
  assert.equal(role.imports[0].origin, 'authored')
  assert.deepEqual(role.imports[0].specifiers, [
    { kind: 'named', local: 'h', imported: 'createElement' },
    { kind: 'named', local: 'Frag', imported: 'Fragment' },
  ])
}
function assertNamedClassicNativeOwner(owned) {
  assert.equal(owned.length, 1)
  const roles = owned[0].section.data.roles
  assert.equal(roles.length, 1)
  const role = roles[0]
  assert.equal(role.request, 'react')
  assert.equal(role.resolvedFormat, 'commonjs')
  assert.equal(role.imports.length, 1)
  assert.equal(role.imports[0].origin, 'authored')
  assert.deepEqual(role.imports[0].specifiers, [
    { kind: 'named', local: 'h', imported: 'createElement' },
  ])
}
function assertAutomaticNativeOwner(owned) {
  assert.equal(owned.length, 1)
  const roles = owned[0].section.data.roles
  assert.equal(roles.length, 1)
  const role = roles[0]
  assert.equal(role.request, 'react/jsx-runtime')
  assert.equal(role.resolvedFormat, 'commonjs')
  assert.equal(role.imports.length, 1)
  assert.equal(role.imports[0].origin, 'generated-jsx')
  assert.equal(role.imports[0].specifiers.length, 1)
  assert.equal(role.imports[0].specifiers[0].kind, 'named')
  assert.equal(role.imports[0].specifiers[0].imported, 'jsx')
}
function assertClassicNativeOwner(owned) {
  assert.equal(owned.length, 1)
  const roles = owned[0].section.data.roles
  assert.equal(roles.length, 1)
  const role = roles[0]
  assert.equal(role.request, 'react')
  assert.equal(role.resolvedFormat, 'commonjs')
  assert.equal(role.imports.length, 1)
  assert.equal(role.imports[0].origin, 'authored')
  assert.deepEqual(role.imports[0].specifiers, [
    { kind: 'default', local: 'React', imported: 'default' },
  ])
}
function assertChildNativeOwner(owned, source) {
  if (source.runtime === 'classic') return assertClassicNativeOwner(owned)
  if (source.runtime === 'named') {
    assert.equal(owned.length, 1)
    const roles = owned[0].section.data.roles
    assert.equal(roles.length, 1)
    const role = roles[0]
    assert.equal(role.request, 'react')
    assert.equal(role.resolvedFormat, 'commonjs')
    assert.equal(role.imports.length, 1)
    assert.equal(role.imports[0].origin, 'authored')
    assert.deepEqual(role.imports[0].specifiers, source.nativeSpecifiers)
    return
  }
  assert.equal(source.runtime, 'automatic')
  assert.equal(owned.length, 1)
  const roles = owned[0].section.data.roles
  assert.equal(roles.length, 1)
  const role = roles[0]
  assert.equal(role.request, 'react/jsx-runtime')
  assert.equal(role.resolvedFormat, 'commonjs')
  assert.equal(role.imports.length, 1)
  assert.equal(role.imports[0].origin, 'generated-jsx')
  assert(role.imports[0].specifiers.every((value) => value.kind === 'named'))
  assert.deepEqual(
    role.imports[0].specifiers.map((value) => value.imported).sort(),
    source.runtimeImports
  )
}
try {
  const signal = new AbortController().signal
  const assertLease = () => {
    signal.throwIfAborted()
    assert.equal(disposed, false)
  }
  let sourcePlan, runtimeConfigurationPlan, prepareRuntimeConfigurationReceipt
  const sourceDeclarations = []
  if (browserJsx) {
    const {
      createCoverageSourcePlan,
    } = require('next/dist/experimental/testing/coverage/source-analysis-plan')
    const runtime = require('next/dist/experimental/testing/coverage/runtime-configuration')
    const {
      analyzeCompiledBrowserCoverageSource,
    } = require('next/dist/experimental/testing/coverage/browser-source-analysis')
    const {
      assertCoverageCompletion,
    } = require('next/dist/experimental/testing/execution/coverage')
    const project = {
      profile,
      entries: [entry],
      include: [reference.cases[0].file],
      exclude: [],
      setupFiles: [],
    }
    const config = coverageConfig
    sourcePlan = await createCoverageSourcePlan({
      projectDir: fixture,
      projects: [project],
      config,
      signal,
    })
    runtimeConfigurationPlan = await runtime.createRuntimeConfigurationPlan({
      projectDir: fixture,
      projects: [project],
      signal,
    })
    prepareRuntimeConfigurationReceipt =
      runtime.prepareRuntimeConfigurationReceipt
    compiler = await createTestCompilerSession(fixture, profile, {
      browserCoverageDeclarations: true,
    })
    for (const request of sourcePlan.requests) {
      const compiled = await compiler.compileCoverageSource(request.source, {
        signal,
        revision: request.revision,
        configurationImports: request.configurationImports,
      })
      assert.equal(compiled.artifact.kind, 'browser')
      assert.equal(compiled.artifact.coverage.browser.version, 2)
      assert.throws(
        () =>
          assertCoverageCompletion(
            {
              version: 1,
              runId: 'cannot-execute-declaration',
              entryId: compiled.artifact.entryId,
              revision: compiled.artifact.revision,
              complete: true,
              data: {},
            },
            compiled.artifact,
            'cannot-execute-declaration'
          ),
        /Compile-only/
      )
      const nativeFile = join(
        compiled.artifact.rootDir,
        compiled.artifact.coverage.browser.nativeMetadata.path
      )
      assert.equal(
        hash(nativeFile),
        compiled.artifact.coverage.browser.nativeMetadata.sha256
      )
      const certificate = JSON.parse(readFileSync(nativeFile, 'utf8'))
      const owned = Object.entries(
        certificate.importInitializers?.sectionsByScript ?? {}
      ).flatMap(([path, sections]) =>
        sections
          .filter(
            (section) => section.data.issuer.sha256 === request.source.sha256
          )
          .map((section) => ({ path, section }))
      )
      assert.equal(owned.length, typedWithoutJsx ? 0 : 1)
      if (creatorScopesJsx) assertCreatorNativeOwner(owned)
      if (classicJsx) assertClassicNativeOwner(owned)
      if (automaticJsx) assertAutomaticNativeOwner(owned)
      if (namedClassicJsx) assertNamedClassicNativeOwner(owned)
      if (namedFragmentJsx) assertNamedFragmentNativeOwner(owned)
      if (childShapesJsx)
        assertChildNativeOwner(
          owned,
          reference.sourceFiles[basename(request.source.file)]
        )
      save('declaration-native-' + (sourceDeclarations.length + 1), {
        source: request.source,
        owned,
      })
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
      assert(
        [
          ...Object.values(fact.data.s),
          ...Object.values(fact.data.f),
          ...Object.values(fact.data.b).flat(),
        ].every((count) => count === 0)
      )
      if (declarationDto) {
        assert.deepEqual(fact, structuredClone(fact))
        assert(fact.data.meta.fnNames instanceof Map)
        assert(
          Object.values(fact.data.statementMap).some(
            (location) => location.end.column === Infinity
          )
        )
        const zero = structuredClone(
          reference.coverage[basename(request.source.file)]
        )
        for (const key of ['s', 'f'])
          for (const id of Object.keys(zero[key])) zero[key][id] = 0
        for (const id of Object.keys(zero.b))
          zero.b[id] = zero.b[id].map(() => 0)
        assert.deepEqual(
          JSON.parse(
            JSON.stringify({ ...fact.data, path: basename(fact.data.path) })
          ),
          zero
        )
        declarationOwnership.push({
          cloneEqual: true,
          actualMap: true,
          mapSize: fact.data.meta.fnNames.size,
          infiniteEndpointsRetained: true,
          fullGenuineZeroModelEqual: true,
        })
      }
      sourceDeclarations.push(fact)
      save('declaration-' + sourceDeclarations.length, fact)
    }
    assert(sourceDeclarations.length > 0)
    save('source-plan', sourcePlan)
    save('runtime-configuration-plan', runtimeConfigurationPlan)
  } else {
    compiler = await createTestCompilerSession(fixture, profile)
  }
  const runtimeRequest = runtimeConfigurationPlan?.requests[0]
  const artifact = await compiler.compile(entry, {
    signal,
    coverage,
    ...(runtimeRequest
      ? {
          runtimeConfigurationImports: {
            authorization: runtimeRequest.authorization,
            entry: runtimeRequest.entries[0],
          },
        }
      : {}),
  })
  assert.equal(artifact.profile.mode, 'production')
  assert.equal(artifact.kind, 'browser')
  assert.equal(artifact.coverage.browser.version, 2)
  assert.equal(artifact.coverage.sourcePreservation, undefined)
  const nativeFile = join(
    artifact.rootDir,
    artifact.coverage.browser.nativeMetadata.path
  )
  assert.equal(
    hash(nativeFile),
    artifact.coverage.browser.nativeMetadata.sha256
  )
  const certificate = JSON.parse(readFileSync(nativeFile, 'utf8'))
  assert.equal(certificate.version, 2)
  assert.equal(certificate.mode, 'production')
  assert.equal(certificate.sourceMaps, 'absolute-file-uri')
  assert.equal(certificate.preserveOriginalSyntax, true)
  const bootstrap = artifact.client.scripts.filter((path) =>
    path.endsWith('.bootstrap.js')
  )
  assert.equal(
    bootstrap.length,
    1,
    'Explicit shared production runtime must exercise its real bootstrap'
  )
  for (const path of bootstrap) {
    assert.equal(
      artifact.coverage.browser.generatedScripts[path].sha256,
      hash(join(artifact.rootDir, path))
    )
    assert.equal(
      artifact.coverage.browser.generatedScripts[path].role,
      'native-ecmascript-bookkeeping'
    )
    assert(
      certificate.scripts.some(
        (script) =>
          script.path === path &&
          script.sha256 === hash(join(artifact.rootDir, path))
      )
    )
  }
  if (classicJsx || automaticJsx || namedClassicJsx || namedFragmentJsx) {
    const source = Object.entries(reference.sourceFiles).find(([file]) =>
      /\.[jt]sx$/.test(file)
    )[1]
    const owned = Object.values(
      certificate.importInitializers?.sectionsByScript ?? {}
    ).flatMap((sections) =>
      sections
        .filter((section) => section.data.issuer.sha256 === source.sha256)
        .map((section) => ({ section }))
    )
    if (classicJsx) assertClassicNativeOwner(owned)
    else if (automaticJsx) assertAutomaticNativeOwner(owned)
    else if (namedClassicJsx) assertNamedClassicNativeOwner(owned)
    else assertNamedFragmentNativeOwner(owned)
    save('runtime-layout-native', owned)
  }
  if (childShapesJsx) {
    const actual = []
    for (const [file, source] of Object.entries(reference.sourceFiles)) {
      if (!file.endsWith('.tsx')) continue
      const owned = Object.values(
        certificate.importInitializers?.sectionsByScript ?? {}
      ).flatMap((sections) =>
        sections
          .filter((section) => section.data.issuer.sha256 === source.sha256)
          .map((section) => ({ section }))
      )
      assertChildNativeOwner(owned, source)
      actual.push({ file, owned })
    }
    assert.equal(
      actual.length,
      namedChildShapesJsx ? Object.keys(reference.coverage).length : 12
    )
    save('runtime-child-native', actual)
  }
  if (creatorScopesJsx) {
    const actual = []
    for (const [file, source] of Object.entries(reference.sourceFiles)) {
      if (!file.endsWith('.tsx')) continue
      const owned = Object.values(
        certificate.importInitializers?.sectionsByScript ?? {}
      ).flatMap((sections) =>
        sections
          .filter((section) => section.data.issuer.sha256 === source.sha256)
          .map((section) => ({ section }))
      )
      assertCreatorNativeOwner(owned)
      actual.push({ file, owned })
    }
    assert.equal(actual.length, Object.keys(reference.coverage).length)
    save('runtime-creator-native', actual)
  }
  save('artifact', artifact)
  save('native-certificate', certificate)

  await compiler.shutdownCompilation()
  for (const label of ['initial', 'cancel', 'recovery']) {
    const controller = new AbortController(),
      runId = 'production-frame-' + randomUUID()
    let actualCaseCancelled = false
    let coverageCallbackCalls = 0
    const stagedRuntimeConfiguration = browserJsx
      ? await prepareRuntimeConfigurationReceipt({
          artifact,
          plan: runtimeConfigurationPlan,
          artifactRoot: artifact.rootDir,
          signal: controller.signal,
        })
      : undefined
    const currentEvents = [],
      caseRunStarted = performance.now()
    const machine = createMachineReporter({
      projectDir: fixture,
      reporters: ['json'],
      outputFile: join(destination, label + '-report.json'),
      write() {},
      writeError() {},
    })
    try {
      await machine.initialize()
      const machineEvent = (event) => machine.onEvent(event)
      machineEvent({
        version: 1,
        type: 'run-start',
        runId,
        timestamp: Date.now(),
        snapshotUpdateMode: 'none',
        specificationOrder: [entry.id],
      })
      const result = await executeClient(artifact, {
        entry,
        runId,
        projectDir: fixture,
        setupFiles: [],
        signal: controller.signal,
        testFrame: true,
        browserEngine: 'chromium',
        browserViewport: { width: 640, height: 480 },
        coverage,
        captureTaskResults: true,
        snapshotUpdateMode: 'none',
        testTimeout: 5000,
        hookTimeout: 10000,
        fileTimeout: 60000,
        onEvent(event) {
          machineEvent(event)
          currentEvents.push(event)
          events.push({ label, event })
          appendFileSync(
            join(destination, 'events.jsonl'),
            JSON.stringify({ label, event }) + '\n'
          )
          if (label === 'cancel' && event.type === 'case-end') {
            actualCaseCancelled = true
            controller.abort(
              new Error(
                'cancelled after real production Browser case before coverage publication'
              )
            )
          }
        },
        async onCoverage(completion) {
          coverageCallbackCalls++
          assert.equal(label === 'cancel', false)
          assert.equal(completion.runId, runId)
          assert.equal(completion.entryId, artifact.entryId)
          assert.equal(completion.revision, artifact.revision)
          assert.equal(completion.complete, true)
          save(label + '-raw-capture', completion)
          const receipt = await stagedRuntimeConfiguration?.seal()
          if (declarationDto && label === 'initial') {
            const declaration = namedChildShapesJsx
              ? sourceDeclarations.find(
                  (fact) =>
                    reference.sourceFiles[basename(fact.source.file)]
                      .runtime === 'named'
                )
              : sourceDeclarations[0]
            assert(declaration)
            const id = Object.keys(declaration.data.s)[0]
            const count = declaration.data.s[id]
            let mutated = false
            try {
              await assert.rejects(
                remapPlannedBrowserStandardCoverage(
                  artifact,
                  completion,
                  {
                    runId,
                    entry,
                    sourcePlan,
                    sourceDeclarations,
                    runtimeConfigurationPlan,
                    runtimeConfigurationReceipt: receipt,
                    assertLease() {
                      assertLease()
                      if (!mutated) {
                        mutated = true
                        declaration.data.s[id] = count + 1
                      }
                    },
                  },
                  controller.signal
                ),
                /Planned Browser coverage lost its parent compiler lease/
              )
              assert(mutated)
              declarationMutationVetoes.push(true)
            } finally {
              declaration.data.s[id] = count
            }
          }
          const standard = browserJsx
            ? await remapPlannedBrowserStandardCoverage(
                artifact,
                completion,
                {
                  runId,
                  entry,
                  sourcePlan,
                  sourceDeclarations,
                  runtimeConfigurationPlan,
                  runtimeConfigurationReceipt: receipt,
                  assertLease,
                },
                controller.signal
              )
            : await remapStandardCoverage(artifact, completion.data)
          save(label + '-standard', standard)
          assert.deepEqual(
            standard.files.map((file) => basename(file.file)).sort(),
            runtimeFiles.slice().sort()
          )
          const mappedReportJSON = JSON.parse(
            JSON.stringify(
              Object.fromEntries(
                standard.files.map((file) => [
                  basename(file.file),
                  { ...file.data, path: basename(file.file) },
                ])
              )
            )
          )
          save(label + '-mapped-report-json', mappedReportJSON)
          assert.deepEqual(
            mappedReportJSON,
            Object.fromEntries(
              Object.entries(reference.coverage).filter(([file]) =>
                runtimeFiles.includes(file)
              )
            )
          )
          const reportsDirectory = '.production-coverage-report-' + label
          const publication = await publishStandardCoverage({
            projectDir: fixture,
            facts: [standard],
            expected: new Set([artifact.entryId]),
            excludedFiles: [],
            config: { ...coverageConfig, reportsDirectory },
            status: 'passed',
            includeUnimported,
            ...(browserJsx
              ? {
                  sourceAnalysis: {
                    facts: sourceDeclarations,
                    plan: sourcePlan,
                  },
                  runtimeConfiguration: {
                    receipts: [receipt],
                    plan: runtimeConfigurationPlan,
                  },
                }
              : {}),
            signal: controller.signal,
          })
          assert.equal(publication.published, true)
          assert.deepEqual(publication.thresholdErrors, [])
          const report = JSON.parse(
            readFileSync(
              join(fixture, reportsDirectory, 'coverage-final.json'),
              'utf8'
            )
          )
          save(label + '-published-coverage', report)
          save(label + '-publication', publication)
          const actual = Object.fromEntries(
            Object.entries(report).map(([file, data]) => [
              basename(file),
              { ...data, path: basename(file) },
            ])
          )
          assert.equal(
            Object.keys(actual).length,
            standard.files.length + (reference.unimportedFiles?.length ?? 0)
          )
          assert.deepEqual(
            Object.keys(actual).sort(),
            Object.keys(reference.coverage).sort()
          )
          assert.deepEqual(actual, reference.coverage)
          if (includeUnimported) {
            const compareReports = (directory, published, suffix) => {
              const summary = JSON.parse(
                readFileSync(
                  join(fixture, directory, 'coverage-summary.json'),
                  'utf8'
                )
              )
              const lcov = readFileSync(
                join(fixture, directory, 'lcov.info'),
                'utf8'
              )
              const canonicalSummary = Object.fromEntries(
                Object.entries(summary).map(([file, data]) => [
                  file === 'total' ? file : basename(file),
                  data,
                ])
              )
              save(label + '-' + suffix + '-reporters', {
                summary,
                lcov,
                text: published.textSummary,
              })
              assert.deepEqual(
                canonicalSummary,
                reference.reportOutputs.summary
              )
              assert.equal(lcov, reference.reportOutputs.lcov)
              assert.equal(
                published.textSummary.trim(),
                reference.reportOutputs.text.trim()
              )
              const final = JSON.parse(
                readFileSync(
                  join(fixture, directory, 'coverage-final.json'),
                  'utf8'
                )
              )
              assert.deepEqual(
                Object.fromEntries(
                  Object.entries(final).map(([file, data]) => [
                    basename(file),
                    { ...data, path: basename(file) },
                  ])
                ),
                reference.coverage
              )
            }
            for (const name of reference.unimportedFiles) {
              const data = actual[name]
              assert(
                [
                  ...Object.values(data.s),
                  ...Object.values(data.f),
                  ...Object.values(data.b).flat(),
                ].every((count) => count === 0)
              )
              assert.equal(
                standard.files.some((file) => basename(file.file) === name),
                false,
                'Unimported zeros must come from the selected declaration, not fabricated runtime hits'
              )
            }
            compareReports(reportsDirectory, publication, 'threshold50')
            const failureDirectory = reportsDirectory + '-threshold99'
            const failed = await publishStandardCoverage({
              projectDir: fixture,
              facts: [standard],
              expected: new Set([artifact.entryId]),
              excludedFiles: [],
              config: {
                ...coverageConfig,
                reportsDirectory: failureDirectory,
                thresholds: reference.failingThresholds,
              },
              status: 'passed',
              includeUnimported: true,
              sourceAnalysis: { facts: sourceDeclarations, plan: sourcePlan },
              runtimeConfiguration: {
                receipts: [receipt],
                plan: runtimeConfigurationPlan,
              },
              signal: controller.signal,
            })
            save(label + '-threshold99-publication', failed)
            assert.equal(failed.published, true)
            assert.equal(failed.thresholdErrors.length, 4)
            assert.deepEqual(
              failed.thresholdErrors,
              reference.thresholdFailureDiagnostics
            )
            compareReports(failureDirectory, failed, 'threshold99')
          }
          const subject =
            actual['subject.mjs'] ||
            actual['subject.ts'] ||
            actual['subject.tsx']
          const unused = completion.data.scripts
            .flatMap((script) => script.functions)
            .filter((fn) => fn.functionName === 'unused')
          if (
            Object.values(reference.coverage).some((data) =>
              Object.values(data.fnMap).some((fn) => fn.name === 'unused')
            )
          )
            assert(
              unused.some((fn) => fn.ranges[0]?.count === 0),
              'Real precise capture must retain the emitted unused function with zero calls'
            )
          completions.push(completion)
          save(label + '-capture', completion)
          save(label + '-standard', standard)
          save(label + '-reference-map', actual)
          save(label + '-subject', subject)
          save(label + '-line', await remapCoverage(artifact, completion.data))
        },
      })
      assert.equal(coverageCallbackCalls, label === 'cancel' ? 0 : 1)
      if (label === 'cancel')
        assert.equal(
          existsSync(join(fixture, '.production-coverage-report-cancel')),
          false
        )
      machineEvent({
        version: 1,
        type: 'run-end',
        runId,
        timestamp: Date.now(),
        status: result.status,
        durationMs: performance.now() - caseRunStarted,
      })
      await machine.finish()
      const report = machine.getJson()
      if (label !== 'cancel') {
        const cases = report.testResults.map((file) => ({
          file: basename(file.name),
          status: file.status,
          cases: file.assertionResults.map((test) =>
            Object.fromEntries(
              [
                'ancestorTitles',
                'fullName',
                'status',
                'title',
                'failureMessages',
                'meta',
                'tags',
                'benchmarks',
              ]
                .filter((key) => key in test)
                .map((key) => [key, test[key]])
            )
          ),
        }))
        assert.deepEqual(cases, reference.cases)
        assert.equal(report.numPassedTests, reference.numPassedTests)
        assert.equal(report.success, true)
      }
      save(label + '-result', {
        result,
        published: completions.length,
        actualCaseCancelled,
        coverageCallbackCalls,
        diagnostics: currentEvents.filter(
          (event) => event.type === 'diagnostic'
        ),
      })
      assert.equal(
        result.status,
        label === 'cancel' ? 'cancelled' : 'passed',
        JSON.stringify(
          currentEvents.filter((event) => event.type === 'diagnostic')
        )
      )
      if (label === 'cancel') assert(actualCaseCancelled)
      assert.equal(completions.length, label === 'recovery' ? 2 : 1)
      for (const [name, sha] of Object.entries(before))
        assert.equal(hash(join(fixture, name)), sha)
    } finally {
      await machine.dispose()
    }
  }
  if (declarationDto) {
    assert.equal(
      declarationOwnership.length,
      namedChildShapesJsx || creatorScopesJsx
        ? Object.keys(reference.coverage).length
        : childShapesJsx
          ? 12
          : 1
    )
    assert.equal(declarationMutationVetoes.length, 1)
  }
  save('result', {
    mode: 'production',
    sdk,
    status: 'passed',
    entireReferenceCoverageMapsEqual: 2,
    actualCaseCancellationVetoes: 1,
    productionBootstrapCertified: true,
    ...(browserJsx
      ? { browserDeclarations: sourceDeclarations.length }
      : { unusedDenominatorsRetained: true }),
    ...(includeUnimported
      ? {
          selectedUnimportedZeros: reference.unimportedFiles,
          exactFormatterReports: 4,
          numericThresholdOutcomes: [50, 99],
          thresholdDiagnosticTextExact: true,
        }
      : {}),
    ...(declarationDto
      ? {
          declarationOwnership,
          declarationMutationVetoes: declarationMutationVetoes.length,
        }
      : {}),
    sourceHashes: before,
    scope:
      'maintained isolated compiled child; complete JS/TS, original Fragment, selected unimported, no-JSX typed, native-owned default/named classic element/fragment conditional-child and automatic JSX production reports; other JSX layouts/public admission remain separate',
  })
  console.log(
    JSON.stringify({
      mode: 'production',
      sdk,
      maps: 2,
      cancelledWithoutPublication: 1,
      actualSharedBootstrap: true,
      status: 'passed',
    })
  )
} finally {
  disposed = true
  await compiler?.dispose()
}
