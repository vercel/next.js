const assert = require('node:assert/strict')
const {
  createCollector,
} = require('next/dist/experimental/testing/runner/collector')
const {
  validateSynchronousClient,
} = require('next/dist/experimental/testing/client/validate')
const {
  createClientResultCollector,
} = require('next/dist/experimental/testing/client/results')

const artifact = {
  entryId: 'entry',
  revision: 'revision',
  client: { sourceFile: '/original/concurrent.test.mjs' },
}
async function declarations(configured, declared) {
  const collector = createCollector('entry', {
    ...(configured ? { sequence: { concurrent: true } } : {}),
  })
  const api = declared ? collector.api.test.concurrent : collector.api.test
  for (const name of ['A', 'B', 'C']) api(name, () => {})
  await collector.settle()
  const root = collector.close()
  assert.throws(
    () => validateSynchronousClient(root, {}),
    /without concurrency/
  )
  const result = validateSynchronousClient(root, {
    caseScheduling: 'concurrent-v1',
  })
  assert.deepEqual(
    result
      .filter((task) => task.type === 'test')
      .map((task) => task.concurrent),
    [true, true, true]
  )
  return result
}
function create(definitions, maxConcurrency, legacy = false) {
  const collector = createClientResultCollector(artifact, {
    runId: 'run',
    maxConcurrency,
    ...(legacy ? {} : { caseScheduling: 'concurrent-v1' }),
  })
  collector.accept({
    type: 'collected',
    declarations: legacy
      ? definitions.map(({ concurrent: _concurrent, ...task }) => task)
      : definitions,
  })
  return collector
}
const context = (index) => ({
  id: `run/entry/${index}/0/0`,
  fileId: 'entry',
  testId: `entry/${index}`,
  name: ['A', 'B', 'C'][index],
  retry: 0,
  repeat: 0,
})
const start = (collector, index) =>
  collector.accept({ type: 'case-start', context: context(index) })
const origin = (index) => ({
  fileId: 'entry',
  caseId: context(index).testId,
  attempt: { id: context(index).id, retry: 0, repeat: 0 },
})
async function main() {
  let controls = 0
  for (const [configured, declared] of [
    [false, true],
    [true, false],
  ]) {
    const definitions = await declarations(configured, declared)
    const parallel = create(definitions, 2)
    start(parallel, 0)
    start(parallel, 1)
    parallel.assertLiveCommandOrigin(origin(0))
    parallel.assertLiveCommandOrigin(origin(1))
    assert.throws(() => start(parallel, 2), /attempt owner/)
    assert.throws(() => start(parallel, 0), /attempt owner/)
    parallel.assertLiveCommandOrigin(origin(0))
    parallel.assertLiveCommandOrigin(origin(1))
    controls += 2
    const limited = create(definitions, 1)
    start(limited, 0)
    assert.throws(() => start(limited, 1), /attempt owner/)
    controls++
    const mixed = create(
      definitions.map((task) =>
        task.name === 'B' ? { ...task, concurrent: false } : task
      ),
      2
    )
    start(mixed, 0)
    assert.throws(() => start(mixed, 1), /attempt owner/)
    controls++
    const legacy = create(definitions, 2, true)
    start(legacy, 0)
    assert.throws(() => start(legacy, 1), /attempt owner/)
    controls++
  }
  const fixture = createCollector('fixture')
  fixture.api.test.extend({ value: 1 })('fixture', () => {})
  await fixture.settle()
  assert.throws(
    () =>
      validateSynchronousClient(fixture.close(), {
        caseScheduling: 'concurrent-v1',
      }),
    /fixtures are not supported/
  )
  process.stdout.write(
    JSON.stringify({
      controls,
      explicitAndConfiguredDefinitions: true,
      exactTwoLiveNativeOwners: true,
      positiveLimitsEnforced: true,
      mixedAndDuplicateStartsRejected: true,
      legacyAndFixtureControlsPreserved: true,
    }) + '\n'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
