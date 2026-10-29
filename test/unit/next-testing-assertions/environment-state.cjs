const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { pathToFileURL } = require('node:url')
const Module = require('node:module')
const { createRequire } = Module
const [project, output] = process.argv.slice(2)
assert(project)
const request = createRequire(path.join(project, 'package.json'))
const packageRoot = path.dirname(request.resolve('next/package.json'))
request(path.join(packageRoot, 'dist/server/node-environment-baseline'))
const { openTestEnvironment } = request(
  path.join(packageRoot, 'dist/experimental/testing/environments/runtime')
)
const runner = request(
  path.join(packageRoot, 'dist/experimental/testing/runner')
)
const vitest = request(
  path.join(packageRoot, 'dist/experimental/testing/vitest')
)
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-assertion-environment-')
)
const rows = []
async function ownerControl(kind, capture) {
  const trace = path.join(
    directory,
    kind + '-' + typeof capture + '-' + String(capture) + '.jsonl'
  )
  const provider = path.join(
    directory,
    kind + '-' + typeof capture + '-' + String(capture) + '.mjs'
  )
  const name = kind === 'undefined-name' ? 'undefined' : "'resolved-'+reads"
  const thrown = kind === 'undefined-throw' ? 'undefined' : 'failure'
  const throws = [
    'error-throw',
    'undefined-throw',
    'distinct-cleanup',
    'same-cleanup',
  ].includes(kind)
  const source = `import{appendFileSync}from'node:fs';let reads=0;export const failure=new RangeError('actual environment name');export const cleanup=new TypeError('independent teardown');const row=x=>appendFileSync(${JSON.stringify(trace)},JSON.stringify(x)+'\\n');const value={get name(){reads++;row({phase:'name',reads,receiver:this===value});${throws ? 'if(reads===2)throw ' + thrown + ';' : ''}return reads===1?'validation-name':${name}},viteEnvironment:'ssr',setup(){row({phase:'setup'});return{teardown(){row({phase:'teardown'});${kind === 'distinct-cleanup' ? 'throw cleanup' : kind === 'same-cleanup' ? 'throw failure' : ''}}}}};export default value;`
  fs.writeFileSync(provider, source)
  const namespace = await import(pathToFileURL(provider).href)
  let owner,
    rejected = false,
    error
  try {
    owner = await openTestEnvironment(
      directory,
      { name: provider },
      undefined,
      capture
    )
  } catch (reason) {
    rejected = true
    error = reason
  }
  if (capture === true && throws) {
    assert(rejected)
    if (kind === 'distinct-cleanup' || kind === 'same-cleanup') {
      assert(error instanceof AggregateError)
      assert.equal(error.errors.length, 2)
      assert.equal(error.errors[0], namespace.failure)
      assert.equal(
        error.errors[1],
        kind === 'same-cleanup' ? namespace.failure : namespace.cleanup
      )
    } else
      assert.equal(
        error,
        kind === 'undefined-throw' ? undefined : namespace.failure
      )
  } else {
    assert(!rejected)
    assert(owner)
    if (capture === true) {
      assert(Object.hasOwn(owner, 'assertionEnvironment'))
      assert(Object.hasOwn(owner.assertionEnvironment, 'name'))
      assert.equal(
        owner.assertionEnvironment.name,
        kind === 'undefined-name' ? undefined : 'resolved-2'
      )
    } else assert.deepEqual(Object.keys(owner), ['dispose'])
    await owner.dispose()
    await owner.dispose()
  }
  const effects = fs
    .readFileSync(trace, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.deepEqual(
    effects.map((row) => row.phase),
    capture === true
      ? ['name', 'setup', 'name', 'teardown']
      : ['name', 'setup', 'teardown']
  )
  assert(
    effects.filter((row) => row.phase === 'name').every((row) => row.receiver)
  )
  rows.push({
    kind,
    capture: capture === undefined ? 'omitted' : capture,
    rejected,
    effects,
    independentOccurrences:
      error instanceof AggregateError ? error.errors.length : rejected ? 1 : 0,
  })
}
async function fileControl(holder) {
  const file = runner.initializeTestFile({
    fileId: 'environment-actual-file',
    filePath: path.join(directory, 'actual.test.mjs'),
    ...(holder ? { assertionEnvironment: holder } : {}),
  })
  const effects = []
  const observe = (phase, local) =>
    effects.push({
      phase,
      own: Object.hasOwn(vitest.expect.getState(), 'environment'),
      global: vitest.expect.getState().environment,
      local: local?.getState().environment,
    })
  try {
    await file.collect(async () => {
      observe('collection')
      assert.equal(
        Object.hasOwn(vitest.expect.getState(), 'environment'),
        !!holder
      )
      assert.equal(vitest.expect.getState().environment, holder?.name)
      vitest.expect.setState({ environment: 'collection-authored' })
      file.api.beforeAll(() => {
        observe('beforeAll')
        vitest.expect.setState({ environment: 'beforeAll-authored' })
      })
      file.api.beforeEach(() => {
        observe('beforeEach')
        vitest.expect.setState({ environment: 'beforeEach-authored' })
      })
      file.api.test('real local state', ({ expect: local }) => {
        assert.equal(local.getState().environment, 'beforeEach-authored')
        local.setState({ environment: 'local-authored' })
        assert.equal(
          vitest.expect.getState().environment,
          'beforeEach-authored'
        )
        vitest.expect.setState({ environment: 'body-global-authored' })
        assert.equal(local.getState().environment, 'local-authored')
        observe('body', local)
      })
      file.api.afterAll(() => {
        observe('afterAll')
        assert.equal(
          vitest.expect.getState().environment,
          'body-global-authored'
        )
      })
    })
    const cases = []
    await file.run({
      runId: 'actual-environment-run',
      signal: new AbortController().signal,
      onCaseResult(_task, result) {
        cases.push(result)
      },
    })
    assert.equal(cases.length, 1)
    assert.equal(cases[0].status, 'passed')
    await file.dispose()
    rows.push({
      kind: 'actual-file',
      requested: !!holder,
      explicitUndefined: holder && holder.name === undefined,
      effects,
      actualCases: 1,
      physicalDisposalJoined: true,
    })
  } finally {
    await file.dispose()
  }
}
async function main() {
  try {
    for (const flag of [undefined, false, 'true'])
      await ownerControl('plain', flag)
    for (const kind of [
      'plain',
      'undefined-name',
      'error-throw',
      'undefined-throw',
      'distinct-cleanup',
      'same-cleanup',
    ])
      await ownerControl(kind, true)
    const absent = await openTestEnvironment(directory, { name: 'node' })
    assert.deepEqual(Object.keys(absent), ['dispose'])
    await absent.dispose()
    const present = await openTestEnvironment(
      directory,
      { name: 'node' },
      undefined,
      true
    )
    assert.deepEqual(present.assertionEnvironment, { name: 'node' })
    await present.dispose()
    rows.push({
      kind: 'actual-builtin-node',
      omittedShapeHeld: true,
      actualName: present.assertionEnvironment.name,
    })
    await fileControl(undefined)
    await fileControl({ name: 'resolved-node-owner' })
    await fileControl({ name: undefined })
    if (output)
      fs.writeFileSync(
        output,
        JSON.stringify(
          {
            controls: rows.length,
            rows,
            allRealEnvironmentAndFileOwners: true,
            actualBuiltPackage: true,
            allDisposalsJoined: true,
            node: { execPath: process.execPath, versions: process.versions },
          },
          null,
          2
        ) + '\n'
      )
    console.log(
      JSON.stringify({
        controls: rows.length,
        realFileCases: 3,
        rawUndefinedAndIndependentTeardownHeld: true,
        omittedAndNontrueGetterReadsHeld: true,
        allDisposalsJoined: true,
      })
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
