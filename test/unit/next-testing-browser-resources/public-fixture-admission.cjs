const assert = require('node:assert/strict')
const {
  createCollector,
} = require('next/dist/experimental/testing/runner/collector')
const { initializeTestFile } = require('next/dist/experimental/testing/runner')
const {
  validateSynchronousClient,
} = require('next/dist/experimental/testing/client/validate')
async function main() {
  let controls = 0
  for (const scope of ['test', 'file', 'worker']) {
    const collector = createCollector('fixture-' + scope)
    const test = collector.api.test.extend({ resource: [1, { scope }] })
    test('value', ({ resource }) => assert.equal(resource, 1))
    await collector.settle()
    const root = collector.close()
    assert.throws(
      () => validateSynchronousClient(root, {}),
      /fixtures are not supported/
    )
    assert.throws(
      () =>
        validateSynchronousClient(root, { caseScheduling: 'concurrent-v1' }),
      /fixtures are not supported/
    )
    const tasks = validateSynchronousClient(root, {
      fixtureResources: 'file-v1',
    })
    assert.equal(tasks.filter((task) => task.type === 'test').length, 1)
    controls++
  }
  const concurrent = createCollector('parallel')
  concurrent.api.test
    .extend({ resource: 1 })
    .concurrent('parallel', ({ resource }) => assert.equal(resource, 1))
  await concurrent.settle()
  const root = concurrent.close()
  assert.throws(
    () => validateSynchronousClient(root, { fixtureResources: 'file-v1' }),
    /without concurrency/
  )
  assert.equal(
    validateSynchronousClient(root, {
      caseScheduling: 'concurrent-v1',
      fixtureResources: 'file-v1',
    }).filter((task) => task.type === 'test').length,
    1
  )
  controls++
  for (const scope of ['test', 'file', 'worker']) {
    const file = initializeTestFile({
      fileId: 'owned-' + scope,
      filePath: '/owned-' + scope + '.test.mjs',
      resourceLifetime: 'file',
    })
    const trace = []
    let calls = 0
    try {
      await file.collect(async () => {
        const test = file.api.test.extend({
          resource: [
            async ({}, use) => {
              const resource = { id: ++calls }
              trace.push('setup:' + resource.id)
              await use(resource)
              trace.push('cleanup:' + resource.id)
            },
            { scope },
          ],
        })
        test('A', ({ resource }) => trace.push('A:' + resource.id))
        test('B', ({ resource }) => trace.push('B:' + resource.id))
      })
      assert.throws(
        () => file.validateBrowserClient(),
        /fixtures are not supported/
      )
      file.validateBrowserClient({
        caseScheduling: 'concurrent-v1',
        fixtureResources: 'file-v1',
      })
      const result = await file.run({
        signal: new AbortController().signal,
        testTimeout: 1000,
        hookTimeout: 1000,
      })
      assert.deepEqual(
        result.cases.map((test) => test.status),
        ['passed', 'passed']
      )
      assert.deepEqual(result.errors, [])
    } finally {
      await file.dispose()
    }
    assert.deepEqual(
      trace,
      scope === 'test'
        ? ['setup:1', 'A:1', 'cleanup:1', 'setup:2', 'B:2', 'cleanup:2']
        : ['setup:1', 'A:1', 'B:1', 'cleanup:1']
    )
    controls++
  }
  process.stdout.write(
    JSON.stringify({
      controls,
      plainScopesAdmittedByActualFile: true,
      legacyFixtureRefusalsPreserved: true,
      concurrentCapabilityStillIndependent: true,
      sharedFileAndWorkerLifetime: true,
      testScopeRecreated: true,
    }) + '\n'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
