const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os')
const { createCollector } = require(process.argv[2]),
  { runCollected } = require(process.argv[3]),
  { createAssertionRuntime } = require(process.argv[4]),
  asyncContext = require(process.argv[5])
async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-real-order-')),
    collector = createCollector('zero-order'),
    events = [],
    controlled = new Error('exact zero raw rejection')
  controlled.stack = ''
  const runtime = await createAssertionRuntime({
    testPath: path.join(dir, 'zero.test.mjs'),
    observePublicTaskQueues: true,
    resourceLifetime: 'file',
    getCurrentAttempt: asyncContext.getOriginatingAttempt,
  })
  let attempt = 0,
    rejectedReads = 0,
    fulfilledReads = 0,
    probe = false
  try {
    collector.api.test(
      'raw rejection identity',
      { timeout: 0, retry: 1 },
      (context) => {
        attempt++
        Object.defineProperty(context.task, 'promises', {
          configurable: true,
          get() {
            if (attempt === 1) rejectedReads++
            else fulfilledReads++
            return []
          },
        })
        if (attempt === 1) throw controlled
      }
    )
    collector.api.test('immediate raw invocation', { timeout: 0 }, () =>
      events.push('body')
    )
    const definition = collector.root.children[1]
    assert(definition && definition.options)
    Object.defineProperty(definition.options, 'timeout', {
      configurable: true,
      get() {
        if (probe) {
          events.push('timeout-read')
          queueMicrotask(() => events.push('queued-after-timeout-read'))
        }
        return 0
      },
    })
    await collector.settle()
    const result = await runCollected(
      collector.close(),
      {
        runId: 'zero-order',
        signal: new AbortController().signal,
        beginAttempt(context) {
          if (context.name === 'immediate raw invocation') probe = true
          return runtime.beginAttempt(context)
        },
      },
      () => {}
    )
    assert.deepEqual(
      result.cases.map((c) => c.status),
      ['failed', 'passed', 'passed']
    )
    assert.equal(result.cases[0].errors[0].error, controlled)
    assert.equal(rejectedReads, 0)
    assert.equal(fulfilledReads, 2)
    assert(events.indexOf('body') < events.indexOf('queued-after-timeout-read'))
    assert.deepEqual(events, [
      'timeout-read',
      'body',
      'queued-after-timeout-read',
    ])
    console.log(
      JSON.stringify({
        events,
        exactRawError: true,
        rejectedReads,
        fulfilledReads,
        consumerOnlyAfterFulfilled: true,
        immediateInvocation: true,
      })
    )
  } finally {
    await runtime.finishFile()
    await fs.rm(dir, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
