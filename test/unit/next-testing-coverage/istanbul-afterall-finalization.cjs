if (process.argv[2] === 'supervise') {
  ;(async () => {
    const fs = require('node:fs'),
      path = require('node:path')
    const { pathToFileURL } = require('node:url')
    const [consumer, output, scenario, executionPhase = 'source'] =
      process.argv.slice(3)
    const { runOwnedNode, assertOwnedNodeCompleted } = await import(
      pathToFileURL(
        path.join(
          __dirname,
          '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
        )
      ).href
    )
    fs.mkdirSync(output, { recursive: true })
    const env = {
      ...process.env,
      CI: '1',
      NODE_ENV: 'development',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
      NEXT_TELEMETRY_DISABLED: '1',
    }
    delete env.NODE_OPTIONS
    delete env.NODE_PATH
    const owner = await runOwnedNode(
      [__filename, executionPhase, consumer, output, scenario],
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
      'actual compiled settled afterAll ' + scenario
    )
    require('node:assert/strict').equal(owner.status, 0, owner.stderr)
  })().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
} else {
  const fs = require('node:fs'),
    path = require('node:path'),
    assert = require('node:assert/strict'),
    { randomUUID, createHash } = require('node:crypto'),
    { createRequire } = require('node:module'),
    { spawnSync } = require('node:child_process')
  const [phase, consumerArg, outArg, scenario = 'sync'] = process.argv.slice(2),
    consumer = path.resolve(consumerArg),
    out = path.resolve(outArg),
    repo = path.resolve(__dirname, '../../..'),
    pristine = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, 'fixtures/istanbul-provider/pristine.json')
      )
    ),
    fixture = fs.mkdtempSync(
      path.join(consumer, '.next-istanbul-afterall-identity-')
    ),
    sha = (x) => createHash('sha256').update(x).digest('hex'),
    events = [],
    captures = [],
    results = []
  let cancellationRequests = 0
  fs.mkdirSync(out, { recursive: true })
  process.chdir(fixture)
  process.env.NODE_ENV = 'development'
  process.env.NEXT_TESTING_AFTERALL_OWN_OUTPUT = out + '/ERROR-OWN-FIELDS.json'
  const profile = {
      id: 'afterall',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    },
    signal = new AbortController().signal
  const shared =
    "import{writeFileSync}from'node:fs'\nexport const failure=new Error('owned settled cleanup failure')\nObject.defineProperty(failure,'authored',{value:'unchanged',enumerable:true,configurable:true})\nconst shape=()=>Reflect.ownKeys(failure).map(key=>{const d=Object.getOwnPropertyDescriptor(failure,key);return{key:String(key),enumerable:d.enumerable,configurable:d.configurable,writable:d.writable,get:typeof d.get,set:typeof d.set,...(key==='message'||key==='authored'?{value:d.value}:{})}})\nconst before=shape()\nexport function saveOwn(){writeFileSync(process.env.NEXT_TESTING_AFTERALL_OWN_OUTPUT,JSON.stringify({before,after:shape()}))}\nprocess.once('exit',saveOwn)\n"
  let callback = '()=>{setImmediate(saveOwn);throw failure}'
  if (scenario === 'async')
    callback =
      'async()=>{await Promise.resolve();setImmediate(saveOwn);throw failure}'
  if (scenario === 'timeout') callback = '()=>new Promise(()=>{})'
  if (scenario === 'scope-finalization')
    callback =
      '()=>{void expect(Promise.resolve(1)).resolves.toBe(2);setImmediate(saveOwn);throw failure}'
  if (scenario === 'scope-fulfilled')
    callback =
      '()=>{void expect(Promise.resolve(1)).resolves.toBe(1);setImmediate(saveOwn);throw failure}'
  if (scenario === 'scope-pending')
    callback =
      '()=>{void expect(new Promise(()=>{})).resolves.toBe(1);setImmediate(saveOwn);throw failure}'
  if (scenario === 'scope-before-run')
    callback =
      'async()=>{void expect(Promise.resolve(1)).resolves.toBe(2);await new Promise(resolve=>setImmediate(resolve));setImmediate(saveOwn);throw failure}'
  if (scenario === 'scope-foreign')
    callback =
      '()=>{void expect(Promise.resolve(1)).resolves.toBe(2);Promise.reject(failure);setImmediate(saveOwn);throw failure}'
  if (scenario === 'scope-foreign-return')
    callback =
      '()=>{void expect(1).foreignReturn();rejectForeign(new Error("foreign created rejection"));setImmediate(saveOwn);throw failure}'
  if (scenario === 'scope-mixed-same-error')
    callback =
      '()=>{expect.extend({sharedFailure(){return Promise.reject(failure)}});void expect(1).sharedFailure();setImmediate(saveOwn);throw failure}'
  let body =
    "import{test,afterAll,beforeAll,expect,vi}from'vitest'\nimport{failure,saveOwn}from'./shared-error.mjs'\ntest('body completes before settled cleanup error',()=>{" +
    (scenario === 'disposal'
      ? "const target={method(){return 1}};vi.spyOn(target,'method');Object.defineProperty(target,'method',{configurable:false,writable:false})"
      : '') +
    '})\n' +
    (scenario === 'before-all'
      ? 'beforeAll(()=>{setImmediate(saveOwn);throw failure})\n'
      : 'afterAll(' +
        callback +
        ', ' +
        (scenario === 'timeout' || scenario === 'parallel-timeout'
          ? 20
          : 1000) +
        ')\n')
  if (scenario === 'disposal')
    body =
      "import{test,afterAll,expect}from'vitest'\nimport{failure,saveOwn}from'./shared-error.mjs'\nconst scoped=test.extend({resource:[async({},use)=>{await use(1);throw new Error('owned file fixture teardown failure')},{scope:'file'}]})\nscoped('body completes before settled cleanup error',({resource})=>expect(resource).toBe(1))\nafterAll(()=>{setImmediate(saveOwn);throw failure},1000)\n"
  if (scenario === 'scope-foreign-return')
    body =
      body.replace(
        "import{test,afterAll,beforeAll,expect,vi}from'vitest'",
        "import{test,afterAll,beforeAll,expect,vi,chai}from'vitest'"
      ) +
      "\nlet rejectForeign;const foreign=new Promise((_,reject)=>{rejectForeign=reject});chai.Assertion.addMethod('foreignReturn',function(){return foreign})\n"
  if (scenario === 'fixture-only')
    body =
      "import{test,expect}from'vitest'\nimport{saveOwn}from'./shared-error.mjs'\nconst scoped=test.extend({resource:[async({},use)=>{await use(1);setImmediate(saveOwn);throw new Error('owned file fixture teardown failure')},{scope:'file'}]})\nscoped('body completes before settled cleanup error',({resource})=>expect(resource).toBe(1))\n"
  if (scenario === 'parallel-timeout')
    body += 'afterAll(()=>new Promise(()=>{}),20)\n'
  let session, service
  ;(async () => {
    try {
      for (const [name, file] of Object.entries(pristine.sourceFiles))
        fs.writeFileSync(path.join(fixture, name), file.source)
      fs.writeFileSync(path.join(fixture, 'shared-error.mjs'), shared)
      fs.writeFileSync(path.join(fixture, 'afterall.test.mjs'), body)
      fs.writeFileSync(
        out + '/CORPUS.json',
        JSON.stringify(
          { shared, body, sharedSHA256: sha(shared), bodySHA256: sha(body) },
          null,
          2
        ) + '\n'
      )
      const config = {
        enabled: true,
        provider: 'istanbul',
        include: ['subject.mjs', 'fully.mjs', 'unimported.mjs'],
        exclude: [],
        reporter: ['json', 'json-summary', 'lcovonly'],
        reportsDirectory: 'coverage',
        reportOnFailure: true,
      }
      if (phase === 'reference' || phase.endsWith('-public')) {
        const file = path.join(fixture, 'vitest.config.mjs')
        fs.writeFileSync(
          file,
          'export default ' +
            JSON.stringify(
              {
                test: {
                  include: [
                    'contract.test.mjs',
                    'full.test.mjs',
                    'afterall.test.mjs',
                  ],
                  maxWorkers: 1,
                  testTimeout: 10000,
                  hookTimeout: 1000,
                  ...(scenario === 'parallel-timeout'
                    ? { sequence: { hooks: 'parallel' } }
                    : {}),
                  coverage: config,
                },
              },
              null,
              2
            ) +
            '\n'
        )
        const publicRun = phase.endsWith('-public')
        const nextRoot = publicRun
          ? path.dirname(
              createRequire(path.join(consumer, 'package.json')).resolve(
                'next/package.json'
              )
            )
          : undefined
        if (publicRun)
          fs.writeFileSync(
            path.join(fixture, 'next.config.mjs'),
            'export default ' +
              JSON.stringify({ turbopack: { root: consumer } }) +
              '\n'
          )
        const args = publicRun
          ? [
              path.join(nextRoot, 'dist/bin/next'),
              'test',
              fixture,
              '--run',
              '--reporter=json',
              '--outputFile=' + out + '/cases.json',
            ]
          : [
              path.join(consumer, 'node_modules/vitest/vitest.mjs'),
              'run',
              '--root',
              fixture,
              '--config',
              file,
              '--reporter=json',
              '--outputFile=' + out + '/cases.json',
            ]
        const result = spawnSync(process.execPath, args, {
          cwd: fixture,
          env: process.env,
          encoding: 'utf8',
          timeout: 120000,
        })
        fs.writeFileSync(out + '/stdout.log', result.stdout ?? '')
        fs.writeFileSync(out + '/stderr.log', result.stderr ?? '')
        fs.writeFileSync(
          out + '/EXIT.json',
          JSON.stringify({
            status: result.status,
            signal: result.signal,
            error: result.error?.message,
          }) + '\n'
        )
        assert.equal(result.signal, null)
        assert.equal(result.status, 1)
        fs.cpSync(path.join(fixture, 'coverage'), out + '/coverage', {
          recursive: true,
        })
        const cases = JSON.parse(fs.readFileSync(out + '/cases.json'))
        assert.equal(cases.numPassedTests, 3)
        assert.equal(cases.numFailedTestSuites, 1)
        assert.equal(cases.success, false)
        assert.equal(
          cases.testResults.find(
            (row) => path.basename(row.name) === 'afterall.test.mjs'
          ).status,
          'failed'
        )
        if (publicRun)
          for (const file of [
            'coverage-final.json',
            'coverage-summary.json',
            'lcov.info',
          ]) {
            const raw = fs
              .readFileSync(out + '/coverage/' + file, 'utf8')
              .replaceAll(fixture, '<FIXTURE>')
            if (file.endsWith('.json'))
              assert.deepEqual(JSON.parse(raw), pristine.reports[file])
            else assert.equal(raw, pristine.reports[file])
          }
      } else {
        const req = createRequire(path.join(consumer, 'package.json')),
          nextRoot = path.dirname(req.resolve('next/package.json')),
          root = nextRoot + '/dist/experimental/testing'
        fs.writeFileSync(
          path.join(fixture, 'next.config.mjs'),
          'export default ' +
            JSON.stringify({ turbopack: { root: consumer } }) +
            '\n'
        )
        const {
            createIstanbulSourcePlan,
            openIstanbulInstrumentation,
          } = require(root + '/coverage/istanbul-instrumentation'),
          { remapIstanbulCapture } = require(
            root + '/coverage/istanbul-capture'
          ),
          { createTestCompilerSession } = require(root + '/compiler'),
          { executeWithEnvironment } = require(root + '/execution/execute'),
          { mergeIstanbulCoverage } = require(
            nextRoot + '/dist/compiled/next-test-instrumentation'
          ),
          { writeReports } = require(
            nextRoot + '/dist/compiled/next-test-coverage'
          )
        const plan = await createIstanbulSourcePlan({
          projectDir: fixture,
          profile,
          config,
          excludedFiles: [],
          signal,
        })
        service = await openIstanbulInstrumentation({
          projectDir: fixture,
          plan,
          signal,
        })
        session = await createTestCompilerSession(fixture, profile, {
          istanbulInstrumentation: service.descriptor,
        })
        for (const name of [
          'contract.test.mjs',
          'full.test.mjs',
          'afterall.test.mjs',
        ]) {
          const entry = { id: name, file: path.join(fixture, name), profile },
            artifact = await session.compile(entry, {
              signal,
              coverage: { version: 1, kind: 'node-istanbul' },
            })
          assert.equal(
            artifact.diagnostics.filter((d) => d.severity === 'error').length,
            0
          )
          const executionController =
            scenario === 'abort' && name === 'afterall.test.mjs'
              ? new AbortController()
              : undefined
          const result = await executeWithEnvironment(
            artifact,
            {
              runId: randomUUID(),
              signal: executionController?.signal ?? signal,
              projectDir: fixture,
              entry,
              setupFiles: [],
              snapshotUpdateMode: 'none',
              testTimeout: 10000,
              hookTimeout: 1000,
              fileTimeout: 20000,
              ...(scenario === 'parallel-timeout'
                ? { sequence: { hooks: 'parallel' } }
                : {}),
              coverage: { version: 1, kind: 'node-istanbul' },
              onEvent(e) {
                events.push(e)
                if (
                  executionController &&
                  !executionController.signal.aborted &&
                  e.type === 'suite-end' &&
                  e.status === 'failed'
                ) {
                  cancellationRequests++
                  executionController.abort(
                    new Error('parent abort after authored afterAll')
                  )
                }
              },
              async onIstanbulCoverage(c) {
                captures.push({
                  entry: name,
                  completion: c,
                  mapped: await remapIstanbulCapture(
                    artifact,
                    c.data,
                    fixture,
                    signal
                  ),
                })
              },
            },
            process.env
          )
          results.push(result)
          fs.writeFileSync(
            out + '/OBSERVED.json',
            JSON.stringify(
              { results, events, captures, cancellationRequests },
              null,
              2
            ) + '\n'
          )
        }
        assert.equal(results[2].status, 'failed')
        if (scenario === 'abort') assert.equal(cancellationRequests, 1)
        if (
          [
            'sync',
            'async',
            'scope-finalization',
            'disposal',
            'scope-fulfilled',
            'scope-pending',
            'scope-before-run',
            'scope-foreign-return',
            'fixture-only',
          ].includes(scenario)
        ) {
          assert.equal(captures.length, 3)
          assert.deepEqual(
            captures[2].completion.settledSuiteErrors,
            scenario === 'fixture-only'
              ? undefined
              : [{ suiteId: 'afterall.test.mjs', index: 0 }]
          )
          if (scenario === 'disposal' || scenario === 'fixture-only') {
            const cleanup = events.filter(
              (e) => e.type === 'diagnostic' && e.coverageFileError
            )
            assert.equal(cleanup.length, 1)
            assert.equal(
              cleanup[0].diagnostic.message,
              'owned file fixture teardown failure'
            )
            assert.deepEqual(captures[2].completion.settledFileErrors, [
              {
                index: cleanup[0].coverageFileError.index,
                diagnostic: cleanup[0].diagnostic,
              },
            ])
          }
          const data = mergeIstanbulCoverage(
            captures.map((c) =>
              Object.fromEntries(c.mapped.files.map((f) => [f.file, f.data]))
            )
          )
          fs.mkdirSync(out + '/coverage')
          await writeReports(data, out + '/coverage', [
            'json',
            'json-summary',
            'lcovonly',
          ])
          for (const file of [
            'coverage-final.json',
            'coverage-summary.json',
            'lcov.info',
          ]) {
            const raw = fs
              .readFileSync(out + '/coverage/' + file, 'utf8')
              .replaceAll(fixture, '<FIXTURE>')
            if (file.endsWith('.json'))
              assert.deepEqual(JSON.parse(raw), pristine.reports[file])
            else assert.equal(raw, pristine.reports[file])
          }
        } else {
          assert.equal(captures.length, 2)
          assert.equal(fs.existsSync(out + '/coverage'), false)
        }
      }
      if (fs.existsSync(out + '/ERROR-OWN-FIELDS.json')) {
        const own = JSON.parse(fs.readFileSync(out + '/ERROR-OWN-FIELDS.json'))
        assert.deepEqual(own.after, own.before)
      } else if (
        [
          'sync',
          'async',
          'scope-finalization',
          'disposal',
          'scope-fulfilled',
          'scope-pending',
          'scope-before-run',
          'scope-foreign-return',
          'fixture-only',
        ].includes(scenario)
      )
        throw Error('Actual error-own-field observer did not run')
      fs.writeFileSync(
        out + '/CHECKS.json',
        JSON.stringify(
          {
            phase,
            scenario,
            actualCrossModuleCompiledFailure: phase !== 'reference',
            errorOwnFieldsEqual: fs.existsSync(out + '/ERROR-OWN-FIELDS.json'),
            captureCount: captures.length,
            publicAdmission: false,
          },
          null,
          2
        ) + '\n'
      )
    } finally {
      await session?.dispose()
      await service?.dispose()
      fs.rmSync(fixture, { recursive: true, force: true })
      fs.writeFileSync(
        out + '/CLOSED.json',
        JSON.stringify({
          fixtureRetired: !fs.existsSync(fixture),
          sessionDisposed: !!session,
          serviceDisposed: !!service,
        }) + '\n'
      )
    }
  })().catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
}
