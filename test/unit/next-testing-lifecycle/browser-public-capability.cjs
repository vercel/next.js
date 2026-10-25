const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os')
const runner = require(process.argv[2])
async function main() {
  const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'next-browser-public-capability-')
    ),
    facts = []
  try {
    for (const capture of [false, true]) {
      const file = runner.initializeTestFile({
        fileId: 'browser-public-' + capture,
        filePath: path.join(root, 'queue.test.mjs'),
      })
      file.enableBrowserPublicTaskQueues()
      let stages = [],
        scopeFacts = []
      try {
        await file.collect(async () => {
          assert.throws(
            () => file.enableBrowserPublicTaskQueues(),
            /before collection/
          )
          file.api.test(
            'actual public queue without Node authority',
            async (context) => {
              assert.equal(context.task.context, context)
              const result = context
                  .expect(Promise.resolve(17))
                  .resolves.toBe(17),
                queue = context.task.promises,
                native = queue[0]
              assert.equal(Object.getPrototypeOf(queue), Array.prototype)
              assert.equal(Object.hasOwn(queue, 'push'), false)
              assert(native instanceof Promise)
              assert.notEqual(result, native)
              assert.equal(
                Object.getPrototypeOf(context.task.onFinished),
                Array.prototype
              )
              assert.equal(context.task.onFinished[0].name, '')
              assert.equal(context.task.onFinished[0].length, 0)
              stages.push('body')
              await result
              assert.equal(queue.length, 0)
              context.task.onFinished.push(function (payload) {
                assert.equal(payload, context)
                stages.push('manual')
              })
              context.onTestFinished(function (payload) {
                assert.equal(payload, context)
                stages.push('context')
              }, 0)
            }
          )
          file.api.test(
            'native finished assertion keeps cleanup classification',
            (context) => {
              context.expect(Promise.resolve(1)).resolves.toBe(2)
            }
          )
        })
        assert.throws(
          () => file.enableBrowserPublicTaskQueues(),
          /before collection/
        )
        const runtime = runner.getAssertionRuntime(),
          begin = runtime.beginAttempt
        runtime.beginAttempt = function (...args) {
          const scope = begin(...args)
          scopeFacts.push({
            awaitPublic: typeof scope.awaitBodyAssertions === 'function',
            consumePublic:
              typeof scope.consumePublicTaskPromises === 'function',
            finished: typeof scope.invokeFinishedCallback === 'function',
            nativeBody: typeof scope.observeBodySettlement === 'function',
          })
          return scope
        }
        const result = await file.run({
          runId: 'browser-public-' + capture,
          signal: new AbortController().signal,
          ...(capture ? { captureCompletedModuleResult: true } : {}),
        })
        assert.deepEqual(
          result.cases.map((c) => c.status),
          ['passed', 'failed']
        )
        assert.deepEqual(
          result.cases[1].errors.map((e) => e.phase),
          ['test', 'cleanup']
        )
        assert.equal(
          result.cases[1].errors.some(
            (e) => e.phase === 'assertion' || 'snapshotBodyAssertion' in e
          ),
          false
        )
        assert.deepEqual(stages, ['body', 'context', 'manual'])
        assert.deepEqual(scopeFacts, [
          {
            awaitPublic: false,
            consumePublic: true,
            finished: true,
            nativeBody: false,
          },
          {
            awaitPublic: false,
            consumePublic: true,
            finished: true,
            nativeBody: false,
          },
        ])
        assert.equal(file.getNativeBodySettlement(), undefined)
        assert.equal(Boolean(file.getCompletedModuleResult()), capture)
        await file.dispose()
        assert.equal(file.getNativeBodySettlement(), undefined)
        assert.throws(
          () => file.enableBrowserPublicTaskQueues(),
          /before collection/
        )
        facts.push({
          capture,
          stages,
          privateCapability: scopeFacts[0],
          nodeBodySettlementAbsent: true,
        })
      } finally {
        await file.dispose()
      }
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
  console.log(JSON.stringify({ facts }))
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
