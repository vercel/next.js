const assert = require('node:assert/strict')
const { it } = require('node:test')
const {
  createAttemptUtilities,
} = require('next/dist/experimental/testing/assertions/utilities')

it('ignores JavaScript extra arguments at both public next-timer boundaries', async () => {
  const originalDate = globalThis.Date
  const originalTimeout = globalThis.setTimeout
  const inactive = new Error('the original utility scope is closed')
  let active = true
  const api = createAttemptUtilities(() => {
    if (!active) throw inactive
  })
  let argumentReads = 0
  const ignoredArgument = {
    valueOf() {
      argumentReads++
      throw new Error('extra argument was coerced')
    },
  }
  const observations = []
  try {
    for (const asynchronous of [false, true]) {
      api.useFakeTimers({ now: asynchronous ? 2000 : 1000 })
      const calls = []
      setTimeout(() => calls.push('first'), 5)
      setTimeout(() => calls.push('second'), 10)
      setTimeout(() => calls.push('third'), 15)
      const method = asynchronous
        ? api.advanceTimersToNextTimerAsync
        : api.advanceTimersToNextTimer
      for (const argument of [2, 0, ignoredArgument]) {
        const returned = Reflect.apply(method, undefined, [argument])
        assert.equal(asynchronous ? await returned : returned, api)
        observations.push({
          asynchronous,
          now: Date.now(),
          pending: api.getTimerCount(),
          calls: [...calls],
        })
      }
      api.useRealTimers()
    }
    assert.deepEqual(observations, [
      { asynchronous: false, now: 1005, pending: 2, calls: ['first'] },
      {
        asynchronous: false,
        now: 1010,
        pending: 1,
        calls: ['first', 'second'],
      },
      {
        asynchronous: false,
        now: 1015,
        pending: 0,
        calls: ['first', 'second', 'third'],
      },
      { asynchronous: true, now: 2005, pending: 2, calls: ['first'] },
      { asynchronous: true, now: 2010, pending: 1, calls: ['first', 'second'] },
      {
        asynchronous: true,
        now: 2015,
        pending: 0,
        calls: ['first', 'second', 'third'],
      },
    ])
    assert.equal(argumentReads, 0)
    active = false
    assert.throws(
      () => api.advanceTimersToNextTimer(),
      (error) => error === inactive
    )
    await assert.rejects(
      api.advanceTimersToNextTimerAsync(),
      (error) => error === inactive
    )
    console.log(
      JSON.stringify({
        observations,
        argumentReads,
        fluent: true,
        originalGuardPreserved: true,
      })
    )
  } finally {
    api.dispose()
    assert.equal(globalThis.Date, originalDate)
    assert.equal(globalThis.setTimeout, originalTimeout)
  }
})
