// Data/worker-entry contract controls. Actual native AppPage conformance is separate.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const { createRequire } = require('node:module')

async function run(load, mode) {
  const { validateCompiledTestCohort, cohortArtifactPath } = load(
    'next/dist/experimental/testing/execution/cohort'
  )
  const { prepareCompiledRscEntry } = load(
    'next/dist/experimental/testing/execution/rsc-entry'
  )
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), 'next-rsc-cohort-contract-')
  )
  const project = path.join(parent, 'project')
  const rootDir = path.join(parent, 'emission')
  fs.mkdirSync(project)
  fs.mkdirSync(rootDir)
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
  const names = ['first.test.mjs', 'second.test.mjs']
  const profile = {
    id: 'shared-rsc',
    environment: 'rsc',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
    route: '/shared/[id]',
  }
  const inputs = names.map((file, index) => {
    const source = `// actual different source ${index}\n`
    fs.writeFileSync(path.join(project, file), source)
    return { entryId: `rsc:${index}`, file, sourceHash: digest(source) }
  })
  const routeFacts = {
    version: 1,
    pathname: '/shared/[id]',
    page: '/shared/[id]/page',
    runtime: 'nodejs',
    basePath: '',
    rootParamNames: [],
    config: {
      dynamic: 'force-dynamic',
      dynamicParams: true,
      fetchCache: 'auto',
      revalidate: false,
    },
    entry: { file: inputs[0].file, sha256: inputs[0].sourceHash },
    sources: [
      {
        file: 'app/shared/[id]/page.jsx',
        sha256: digest('actual route source'),
      },
    ],
  }
  const manifestPage = '/__next_test__/shared/page'
  const manifests = {
    clientReference: 'client.js',
    serverActions: 'actions.json',
    previewProps: 'preview.json',
    prerender: 'prerender.json',
    routeBuild: 'build.json',
    routeFont: 'font.json',
    routeLoadable: 'loadable.json',
  }
  const emitted = {
    'entry.cjs':
      'throw new Error("data controls must not evaluate application entry")',
    'cohort.json': JSON.stringify({ cohort: { version: 1, files: names } }),
    'route.json': JSON.stringify(routeFacts),
    'client.js': `globalThis.__RSC_MANIFEST = ${JSON.stringify({ [manifestPage]: { marker: 'actual-client-bytes' } })}`,
    'actions.json': JSON.stringify({ marker: 'actual-actions-bytes' }),
    'preview.json': '{}',
    'prerender.json': '{}',
    'build.json': JSON.stringify({ marker: 'actual-build-bytes' }),
    'font.json': '{}',
    'loadable.json': '{}',
  }
  for (const [file, bytes] of Object.entries(emitted))
    fs.writeFileSync(path.join(rootDir, file), bytes)
  const files = Object.keys(emitted)
  const outputs = files.map((file) => ({
    path: file,
    sha256: digest(emitted[file]),
  }))
  const entries = inputs.map((input) => ({
    id: input.entryId,
    file: path.join(project, input.file),
    profile,
  }))
  const cohort = {
    version: 1,
    artifacts: inputs.map((input, index) => ({
      version: 2,
      kind: 'rsc',
      profile,
      entryId: input.entryId,
      revision: 'one-actual-app-page',
      sourceHash: input.sourceHash,
      rootDir,
      entryPath: 'entry.cjs',
      files,
      diagnostics: [],
      setupFiles: [],
      snapshotSerializers: [],
      manifestPage,
      manifests,
      requestContext: { mode: 'development', routeRenderOpts: {} },
      route: { ...routeFacts, metadataPath: 'route.json' },
      cohort: {
        version: 1,
        index,
        metadataPath: 'cohort.json',
        entries: inputs,
        outputs,
      },
    })),
  }
  let checks = 0
  const check = async (value = cohort) => {
    await validateCompiledTestCohort(value, entries, project)
    checks++
  }
  try {
    if (mode === 'dispatch') {
      const ts = load('typescript')
      const vm = require('node:vm')
      const templateFile = path.join(
        __dirname,
        '../../../packages/next/src/build/templates/app-test.ts'
      )
      const template = fs.readFileSync(templateFile, 'utf8')
      const ast = ts.createSourceFile(
        templateFile,
        template,
        ts.ScriptTarget.Latest,
        true
      )
      const declaration = ast.statements.find(
        (node) =>
          ts.isFunctionDeclaration(node) && node.name?.text === 'loadTestModule'
      )
      assert(declaration)
      const code = ts.transpileModule(
        ts.createPrinter().printNode(ts.EmitHint.Unspecified, declaration, ast),
        {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
          },
        }
      ).outputText
      const exports = {},
        trace = [],
        actualSingle = { same: 'single module identity' }
      let selected = actualSingle
      const dispatcher = {
        async loadTestModule(index) {
          switch (index) {
            case 0:
              trace.push('first-root')
              return 'first-result'
            case 1:
              trace.push('second-root')
              return 'second-result'
            default:
              throw new Error('Unknown compiled test cohort index')
          }
        },
      }
      vm.runInNewContext(code, {
        exports,
        require(specifier) {
          assert.equal(specifier, 'VAR_TEST_MODULE')
          trace.push('require')
          return selected
        },
      })
      assert.deepEqual(trace, [])
      assert.equal(await exports.loadTestModule(), actualSingle)
      selected = dispatcher
      assert.equal(await exports.loadTestModule(0), 'first-result')
      assert.equal(await exports.loadTestModule(1), 'second-result')
      await assert.rejects(
        exports.loadTestModule(2),
        /Unknown compiled test cohort index/
      )
      assert.deepEqual(trace, [
        'require',
        'require',
        'first-root',
        'require',
        'second-root',
        'require',
      ])
      checks += 5
    } else if (mode === 'identity') {
      await check()
      assert.notEqual(
        cohort.artifacts[0].sourceHash,
        cohort.artifacts[1].sourceHash
      )
      assert.equal(cohort.artifacts[1].route.entry.file, names[0])
      assert.equal(cohort.artifacts[1].cohort.index, 1)
      assert.equal(cohort.artifacts[0].rootDir, cohort.artifacts[1].rootDir)
    } else if (mode === 'refusals') {
      const cases = [
        (value) => {
          value.artifacts[1].cohort.index = 0
        },
        (value) => {
          value.artifacts[1].sourceHash = inputs[0].sourceHash
        },
        (value) => {
          value.artifacts[1].route.entry = {
            file: names[1],
            sha256: inputs[1].sourceHash,
          }
        },
        (value) => {
          value.artifacts[1].requestContext.mode = 'production'
        },
        (value) => {
          delete value.artifacts[1].manifests.prerender
        },
        (value) => {
          value.artifacts[1].manifests.routeBuild = 'foreign.json'
        },
        (value) => {
          value.artifacts[1].manifestPage = '/__next_test__/foreign/page'
        },
        (value) => {
          value.artifacts[1].profile = { ...profile, route: '/foreign' }
        },
        (value) => {
          value.artifacts[1].profile = { ...profile, mode: 'production' }
        },
        (value) => {
          delete value.artifacts[1].profile.route
        },
        (value) => {
          value.artifacts[1].moduleMocking = { version: 1 }
        },
        (value) => {
          value.artifacts[1].setupFiles = ['setup.js']
        },
      ]
      for (const mutate of cases) {
        const changed = structuredClone(cohort)
        mutate(changed)
        await assert.rejects(
          validateCompiledTestCohort(changed, entries, project)
        )
        checks++
      }
      await check()
    } else if (mode === 'route-bytes') {
      const changed = structuredClone(cohort)
      const route = { ...routeFacts, basePath: '/actual-other-bytes' }
      const bytes = JSON.stringify(route)
      fs.writeFileSync(path.join(rootDir, 'route.json'), bytes)
      for (const artifact of changed.artifacts)
        artifact.cohort.outputs.find((v) => v.path === 'route.json').sha256 =
          digest(bytes)
      await assert.rejects(
        validateCompiledTestCohort(changed, entries, project),
        /sidecar and artifact facts differ/
      )
      checks++
    } else if (mode === 'source-bytes') {
      fs.writeFileSync(entries[1].file, '// changed actual later root')
      await assert.rejects(
        validateCompiledTestCohort(cohort, entries, project),
        /source changed/
      )
      checks++
    } else if (mode === 'file-bindings') {
      await check()
      const trace = [],
        bindings = []
      let routeCreations = 0,
        sharedRouteModule
      let active
      const entry = {
        ComponentMod: {
          patchFetch() {
            trace.push('patch-fetch')
          },
        },
        ConsumerMod: {},
        testRunner: {
          getActiveAttempt() {
            return active
          },
        },
        initializeRuntime() {
          trace.push('initialize-runtime')
        },
        setManifestsSingleton(value) {
          assert.equal(value.page, routeFacts.page)
          assert.equal(
            value.clientReferenceManifest.marker,
            'actual-client-bytes'
          )
          assert.equal(
            value.serverActionsManifest.marker,
            'actual-actions-bytes'
          )
          trace.push('manifests')
        },
        createRouteEntrypoint(page, pathname) {
          assert.equal(page, routeFacts.page)
          assert.equal(pathname, routeFacts.pathname)
          sharedRouteModule = { actual: 'route instance ' + ++routeCreations }
          return sharedRouteModule
        },
        rscTesting: {
          initializeRscTesting(binding) {
            assert(!active, 'previous file binding must be disposed')
            active = { file: bindings.length }
            bindings.push(binding)
            trace.push('bind:' + active.file)
            return {
              async dispose() {
                trace.push('dispose:' + active.file)
                active = undefined
              },
            }
          },
        },
      }
      const initialize = prepareCompiledRscEntry(
        entry,
        cohort.artifacts[0],
        cohortArtifactPath
      )
      for (let index = 0; index < 2; index++) {
        const directory = path.join(parent, 'file-cache-' + index)
        fs.mkdirSync(directory)
        const binding = initialize({ type: 'file', directory })
        assert.equal(bindings[index].cacheScope.directory, directory)
        assert.equal(
          bindings[index].routeRendering.ComponentMod,
          sharedRouteModule
        )
        assert.equal(
          bindings[index].routeRendering.buildManifest.marker,
          'actual-build-bytes'
        )
        assert.equal(bindings[index].profile, profile)
        assert.equal(bindings[index].getActiveAttempt(), active)
        await binding.dispose()
      }
      assert.notEqual(
        bindings[0].cacheScope.directory,
        bindings[1].cacheScope.directory
      )
      assert.equal(routeCreations, 1)
      assert.equal(
        bindings[0].routeRendering.ComponentMod,
        bindings[1].routeRendering.ComponentMod
      )
      assert.deepEqual(trace, [
        'initialize-runtime',
        'manifests',
        'patch-fetch',
        'bind:0',
        'dispose:0',
        'bind:1',
        'dispose:1',
      ])
      checks += 4
    } else {
      throw new Error('Unknown RSC cohort contract mode')
    }
    return {
      mode,
      checks,
      dataContractOnly: true,
      nativeAppPageConformanceQualified: false,
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true })
  }
}
module.exports = { run }
if (require.main === module) {
  const load = createRequire(
    path.join(path.resolve(process.argv[2]), 'package.json')
  )
  run(load, process.argv[3])
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
