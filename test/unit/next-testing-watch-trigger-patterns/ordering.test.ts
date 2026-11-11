import { setImmediate } from 'node:timers/promises'
import { createOrderedWatchTriggerEvaluator } from 'next/dist/experimental/testing/incremental/watch-trigger-selection'

function gate<T>() {
  let release!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    release = resolve
  })
  return { promise, release }
}
const matches = (files: string[]) =>
  files.map((source) => ({ source, matched: false as const }))

it('starts classification immediately and preserves slow-A/fast-B mapper order', async () => {
  const evaluate = createOrderedWatchTriggerEvaluator()
  const controller = new AbortController()
  const slow = gate<string[]>()
  const started: string[] = []
  const classification = (name: string) => {
    started.push(name)
    return name === 'A' ? slow.promise : Promise.resolve([name])
  }
  const actual: string[] = []
  const run = async (files: string[]) => {
    actual.push(...files)
    return matches(files)
  }
  const first = evaluate(classification('A'), controller.signal, run)
  const second = evaluate(classification('B'), controller.signal, run)
  await setImmediate()
  expect(started).toEqual(['A', 'B'])
  expect(actual).toEqual([])
  slow.release(['A'])
  expect(await Promise.all([first, second])).toEqual([
    matches(['A']),
    matches(['B']),
  ])
  expect(actual).toEqual(['A', 'B'])
})

it.each([
  undefined,
  null,
  false,
  0,
  '',
  new Error('actual later classification'),
])(
  'owns a later fast rejection while A is pending and retains its actual value: %j',
  async (failure) => {
    const evaluate = createOrderedWatchTriggerEvaluator()
    const controller = new AbortController()
    const slow = gate<string[]>()
    const run = jest.fn(async (files: string[]) => matches(files))
    const first = evaluate(slow.promise, controller.signal, run)
    const later = evaluate(Promise.reject(failure), controller.signal, run)
    const rejected = later.then(
      () => ({ rejected: false, failure: undefined }),
      (actual) => ({ rejected: true, failure: actual })
    )
    await setImmediate()
    expect(run).not.toHaveBeenCalled()
    slow.release(['A'])
    expect(await first).toEqual(matches(['A']))
    const result = await rejected
    expect(result.rejected).toBe(true)
    expect(result.failure).toBe(failure)
    expect(run.mock.calls).toEqual([[['A']]])
  }
)

it.each(['abort', 'owner disposal'])(
  'does not enter queued mappers after actual %s lifetime cancellation',
  async (name) => {
    const evaluate = createOrderedWatchTriggerEvaluator()
    const lifetime = new AbortController()
    const reason = new Error(name)
    const slow = gate<string[]>()
    const run = jest.fn(async (files: string[]) => matches(files))
    const first = evaluate(slow.promise, lifetime.signal, run)
    const later = evaluate(Promise.resolve(['B']), lifetime.signal, run)
    const rejected = [first, later].map((promise) =>
      promise.then(
        () => ({ rejected: false, failure: undefined }),
        (failure) => ({ rejected: true, failure })
      )
    )
    lifetime.abort(reason)
    slow.release(['A'])
    for (const result of await Promise.all(rejected)) {
      expect(result.rejected).toBe(true)
      expect(result.failure).toBe(reason)
    }
    expect(run).not.toHaveBeenCalled()
  }
)

it('retains the first actual mapper failure and prevents a queued mapper after its owner aborts', async () => {
  const evaluate = createOrderedWatchTriggerEvaluator()
  const controller = new AbortController()
  const failure = new Error('actual first mapper')
  const first = evaluate(
    Promise.resolve(['A']),
    controller.signal,
    async () => {
      throw failure
    }
  )
  const observed = first.catch((error) => {
    controller.abort(error)
    throw error
  })
  const run = jest.fn(async (files: string[]) => matches(files))
  const later = evaluate(Promise.resolve(['B']), controller.signal, run)
  await Promise.all([
    expect(observed).rejects.toBe(failure),
    expect(later).rejects.toBe(failure),
  ])
  expect(run).not.toHaveBeenCalled()
})
