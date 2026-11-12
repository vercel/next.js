const { readCoverageFixture } = require('./coverage-fixtures.cjs')
if (!process.argv.includes('--owned-metadata-child')) {
  const fs = require('node:fs')
  const path = require('node:path')
  const { pathToFileURL } = require('node:url')
  const [consumer, output] = process.argv.slice(2)
  fs.mkdirSync(output, { recursive: true })
  import(
    pathToFileURL(
      path.join(
        __dirname,
        '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
      )
    ).href
  )
    .then(async ({ runOwnedNode, assertOwnedNodeCompleted }) => {
      const env = {
        ...process.env,
        CI: '1',
        NODE_ENV: 'development',
        TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
        NEXT_TELEMETRY_DISABLED: '1',
      }
      for (const name of [
        'NODE_OPTIONS',
        'NODE_PATH',
        'NEXT_TEST_NATIVE_DIR',
        'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
      ])
        delete env[name]
      const owner = await runOwnedNode(
        [__filename, consumer, output, '--owned-metadata-child'],
        {
          cwd: consumer,
          env,
          auditDir: path.join(output, 'owners'),
          timeoutMs: 120000,
        }
      )
      fs.writeFileSync(
        path.join(output, 'owner.json'),
        JSON.stringify(owner, null, 2) + '\n'
      )
      fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
      fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
      assertOwnedNodeCompleted(
        owner,
        'actual typed-entry artifact and boundary facts'
      )
      require('node:assert/strict').equal(owner.status, 0, owner.stderr)
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
} else {
  const assert = require('node:assert/strict'),
    fs = require('node:fs'),
    path = require('node:path'),
    { createRequire } = require('node:module'),
    { createHash } = require('node:crypto')
  const [consumerArg, outputArg] = process.argv.slice(2),
    consumer = path.resolve(consumerArg),
    output = path.resolve(outputArg),
    load = createRequire(path.join(consumer, 'package.json')),
    nextRoot = path.dirname(load.resolve('next/package.json')),
    runtime = path.join(nextRoot, 'dist/experimental/testing')
  const pristine = readCoverageFixture(
      path.join(
        __dirname,
        'fixtures/istanbul-provider/typed-entry-pristine.json'
      )
    ),
    fixture = fs.mkdtempSync(path.join(consumer, '.next-typed-artifact-'))
  const controller = new AbortController(),
    profile = {
      id: 'typed-entry-facts',
      environment: 'node',
      mode: 'development',
      runtime: 'nodejs',
      bundler: 'turbopack',
    },
    hash = (value) => createHash('sha256').update(value).digest('hex')
  let session, service, ordinary
  fs.mkdirSync(output, { recursive: true })
  process.chdir(fixture)
  process.env.NODE_ENV = 'development'
  ;(async () => {
    try {
      const { createIstanbulSourcePlan, openIstanbulInstrumentation } = require(
          path.join(runtime, 'coverage/istanbul-instrumentation')
        ),
        { createTestCompilerSession } = require(path.join(runtime, 'compiler')),
        { executeWithEnvironment } = require(
          path.join(runtime, 'execution/execute')
        )
      const rows = ['ts', 'mts'].map((ext) =>
        pristine.rows.find((r) => r.name === ext + '-mjs-explicit-true')
      )
      for (const row of rows)
        for (const [name, file] of Object.entries(row.sourceFiles)) {
          fs.writeFileSync(path.join(fixture, name), file)
        }
      fs.writeFileSync(
        path.join(fixture, 'package.json'),
        '{"type":"module"}\n'
      )
      fs.writeFileSync(
        path.join(fixture, 'next.config.mjs'),
        'export default ' +
          JSON.stringify({ turbopack: { root: consumer } }) +
          '\n'
      )
      const config = {
        reporter: ['json'],
        include: ['subject.mjs'],
        exclude: [],
        reportsDirectory: 'coverage',
        reportOnFailure: true,
        thresholds: {},
      }
      const plan = await createIstanbulSourcePlan({
        projectDir: fixture,
        profile,
        config,
        excludedFiles: rows.map((r) => path.join(fixture, r.specFile)),
        signal: controller.signal,
      })
      assert.deepEqual(plan.sources, [
        {
          file: path.join(fixture, 'subject.mjs'),
          sha256: hash(rows[0].sourceFiles['subject.mjs']),
        },
      ])
      service = await openIstanbulInstrumentation({
        projectDir: fixture,
        plan,
        signal: controller.signal,
      })
      session = await createTestCompilerSession(fixture, profile, {
        istanbulInstrumentation: service.descriptor,
      })
      const observations = []
      for (const row of rows) {
        const entry = {
            id: row.specFile,
            file: path.join(fixture, row.specFile),
            profile,
          },
          artifact = await session.compile(entry, {
            signal: controller.signal,
            coverage: { version: 1, kind: 'node-istanbul' },
          })
        fs.writeFileSync(
          path.join(output, row.entryExtension + '.artifact.json'),
          JSON.stringify(artifact, null, 2) + '\n'
        )
        assert.deepEqual(
          artifact.diagnostics.filter((d) => d.severity === 'error'),
          []
        )
        assert(artifact.coverage.istanbul)
        assert.equal(Object.hasOwn(artifact, 'nativeTsConfigInputs'), false)
        for (const field of [
          'sourceAnalysis',
          'sourcePreservation',
          'importRoles',
        ])
          assert.equal(Object.hasOwn(artifact.coverage, field), false)
        assert.deepEqual(
          artifact.coverage.istanbul.sources.map(({ file, sha256 }) => ({
            file,
            sha256,
          })),
          plan.sources
        )
        const selected = Object.values(artifact.coverage.sources).filter(
          Boolean
        )
        assert(selected.length > 0)
        assert(
          selected.every(
            (source) => source.file === path.join(fixture, 'subject.mjs')
          )
        )
        const declaredEntry = Object.entries(artifact.coverage.sources).filter(
          ([identity]) => identity.endsWith('/' + row.specFile)
        )
        assert(declaredEntry.length > 0)
        assert(declaredEntry.every(([, source]) => source === null))
        let captures = 0
        const events = []
        const result = await executeWithEnvironment(
          artifact,
          {
            runId: 'typed-entry-' + row.entryExtension,
            signal: controller.signal,
            projectDir: fixture,
            entry,
            setupFiles: [],
            snapshotSerializers: [],
            snapshotUpdateMode: 'none',
            testTimeout: 10000,
            hookTimeout: 1000,
            fileTimeout: 20000,
            coverage: { version: 1, kind: 'node-istanbul' },
            onEvent: (event) => events.push(event),
            onIstanbulCoverage(completion) {
              captures++
              assert.equal(completion.complete, true)
              fs.writeFileSync(
                path.join(output, row.entryExtension + '.completion.json'),
                JSON.stringify(completion, null, 2) + '\n'
              )
            },
          },
          process.env
        )
        fs.writeFileSync(
          path.join(output, row.entryExtension + '.execution.json'),
          JSON.stringify({ result, events }, null, 2) + '\n'
        )
        assert.equal(result.status, 'passed')
        assert.equal(captures, 1)
        assert.equal(events.filter((e) => e.type === 'case-start').length, 1)
        observations.push({
          entryExtension: row.entryExtension,
          entryExcluded: true,
          noNativeTsOrAnalysisRole: true,
          sourcePlanUnchanged: true,
          actualCompleteCapture: true,
        })
      }
      const refused = []
      for (const ext of ['cjs', 'cts', 'jsx', 'tsx']) {
        const file = path.join(fixture, 'unsupported.test.' + ext)
        fs.writeFileSync(file, rows[0].sourceFiles[rows[0].specFile])
        await assert.rejects(
          () =>
            session.compile(
              { id: 'unsupported-' + ext, file, profile },
              {
                signal: controller.signal,
                coverage: { version: 1, kind: 'node-istanbul' },
              }
            ),
          /Private Istanbul compilation requires one ordinary isolated JavaScript runtime entry/
        )
        refused.push('entry:' + ext)
      }
      for (const field of ['inSource', 'typecheck', 'executionEnvironment']) {
        await assert.rejects(
          () =>
            session.compile(
              {
                id: 'unsupported-' + field,
                file: path.join(fixture, rows[0].specFile),
                profile,
                [field]: field === 'executionEnvironment' ? 'jsdom' : true,
              },
              {
                signal: controller.signal,
                coverage: { version: 1, kind: 'node-istanbul' },
              }
            ),
          /Private Istanbul compilation requires one ordinary isolated JavaScript runtime entry/
        )
        refused.push('entry-role:' + field)
      }
      for (const ext of ['ts', 'mts', 'jsx', 'tsx']) {
        const file = 'selected-source.' + ext
        fs.writeFileSync(
          path.join(fixture, file),
          'export const selected = 1\n'
        )
        await assert.rejects(
          () =>
            createIstanbulSourcePlan({
              projectDir: fixture,
              profile,
              config: { ...config, include: [file] },
              excludedFiles: [],
              signal: controller.signal,
            }),
          /Private Istanbul selection supports only JS, MJS and CJS/
        )
        refused.push('coverage-source:' + ext)
      }
      await session.dispose()
      session = undefined
      ordinary = await createTestCompilerSession(fixture, profile)
      const entry = {
          id: 'ordinary-typed',
          file: path.join(fixture, rows[0].specFile),
          profile,
        },
        plain = await ordinary.compile(entry, { signal: controller.signal })
      assert.equal(Object.hasOwn(plain, 'coverage'), false)
      fs.writeFileSync(
        path.join(output, 'CHECKS.json'),
        JSON.stringify(
          {
            observations,
            refused,
            ordinaryTypedCoverageFieldAbsent: true,
            allOriginalSpecAndSubjectBytesHeld: rows.every((row) =>
              Object.entries(row.sourceFiles).every(
                ([name, file]) =>
                  fs.readFileSync(path.join(fixture, name), 'utf8') === file
              )
            ),
          },
          null,
          2
        ) + '\n'
      )
    } finally {
      await ordinary?.dispose()
      await session?.dispose()
      await service?.dispose()
      fs.rmSync(fixture, { recursive: true, force: true })
      fs.writeFileSync(
        path.join(output, 'CLOSED.json'),
        JSON.stringify({
          fixtureRetired: !fs.existsSync(fixture),
          compilerDisposed: true,
          instrumentationDisposed: true,
        }) + '\n'
      )
    }
  })().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
