it.each(['void', 'promise'] as const)(
  'keeps the actual %s callback result independent of an authored resolve getter',
  async (kind) => {
    const NativePromise = Promise,
      nativeThen = Promise.prototype.then
    const { createCollector } = await import(
      'next/dist/experimental/testing/runner/collector'
    )
    const { runCollected } = await import(
      'next/dist/experimental/testing/runner/lifecycle'
    )
    const { createReporterTaskUpdates } = await import(
      'next/dist/experimental/testing/reporting/task-updates'
    )
    const c = createCollector('actual-promise-owner-' + kind)
    c.api.test('healthy body', () => {})
    let release!: () => void
    const returned = new NativePromise<void>((resolve) => {
      release = resolve
    })
    const receivers: unknown[] = []
    Object.defineProperty(returned, 'then', {
      configurable: true,
      get() {
        receivers.push(this)
        return nativeThen
      },
    })
    let updates = 0,
      lookups = 0
    const marker = new Error('actual authored resolve getter')
    const sender = createReporterTaskUpdates({
      onUpdate() {
        updates++
        return kind === 'void' ? undefined : returned
      },
    })
    const Current = new Proxy(NativePromise, {
      get(target, key, receiver) {
        if (key === 'resolve') {
          lookups++
          throw marker
        }
        return Reflect.get(target, key, receiver)
      },
    })
    try {
      await runCollected(
        c.close(),
        {
          runId: 'actual-promise-run-' + kind,
          filePath: '/project/promise.test.mjs',
          signal: new AbortController().signal,
          onCollected(file) {
            globalThis.Promise = Current
            try {
              sender.collected(file)
            } finally {
              globalThis.Promise = NativePromise
            }
          },
        },
        () => {}
      )
      expect(updates).toBe(1)
      expect(lookups).toBe(0)
      expect(receivers.length).toBe(kind === 'void' ? 0 : 1)
      expect(receivers.every((receiver) => receiver === returned)).toBe(true)
      let finished = false
      const completion = sender.finish().then(() => {
        finished = true
      })
      await NativePromise.resolve()
      expect(finished).toBe(kind === 'void')
      release()
      await completion
      expect(finished).toBe(true)
    } finally {
      globalThis.Promise = NativePromise
      release()
      sender.dispose()
    }
  }
)

it('retains the actual returned send rejection and waits for that operation', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { createReporterTaskUpdates } = await import(
    'next/dist/experimental/testing/reporting/task-updates'
  )
  const c = createCollector('actual-rejected-send')
  c.api.test('healthy', () => {})
  let reject!: (reason: unknown) => void
  const returned = new Promise<void>((_, fail) => {
    reject = fail
  })
  const original = new Error('actual returned operation rejection')
  const sender = createReporterTaskUpdates({
    onUpdate() {
      return returned
    },
  })
  try {
    await runCollected(
      c.close(),
      {
        runId: 'actual-send-run',
        filePath: '/project/send.test.mjs',
        signal: new AbortController().signal,
        onCollected(file) {
          sender.collected(file)
        },
      },
      () => {}
    )
    const completion = sender.finish()
    reject(original)
    await expect(completion).rejects.toBe(original)
  } finally {
    sender.dispose()
  }
})

it('retains an actual synchronous callback rejection value without a pending operation', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { createReporterTaskUpdates } = await import(
    'next/dist/experimental/testing/reporting/task-updates'
  )
  const c = createCollector('actual-sync-send')
  c.api.test('healthy', () => {})
  const sender = createReporterTaskUpdates({
    onUpdate() {
      // Verify that the sender owns the actual falsy thrown value.
      // eslint-disable-next-line no-throw-literal
      throw undefined
    },
  })
  try {
    await runCollected(
      c.close(),
      {
        runId: 'actual-sync-send-run',
        filePath: '/project/sync-send.test.mjs',
        signal: new AbortController().signal,
        onCollected(file) {
          sender.collected(file)
        },
      },
      () => {}
    )
    let caught = false,
      value: unknown
    try {
      await sender.finish()
    } catch (error) {
      caught = true
      value = error
    }
    expect(caught).toBe(true)
    expect(value).toBeUndefined()
  } finally {
    sender.dispose()
  }
})

it('preserves the synchronous then lookup error and releases its pending sender identity', async () => {
  const { createCollector } = await import(
    'next/dist/experimental/testing/runner/collector'
  )
  const { runCollected } = await import(
    'next/dist/experimental/testing/runner/lifecycle'
  )
  const { createReporterTaskUpdates } = await import(
    'next/dist/experimental/testing/reporting/task-updates'
  )
  const c = createCollector('actual-then-getter')
  c.api.test('healthy', () => {})
  const returned = Promise.resolve(),
    original = new Error('actual returned then getter')
  let reads = 0,
    caught = false
  Object.defineProperty(returned, 'then', {
    get() {
      reads++
      throw original
    },
  })
  const sender = createReporterTaskUpdates({
    onUpdate() {
      return returned
    },
  })
  try {
    await runCollected(
      c.close(),
      {
        runId: 'actual-then-run',
        filePath: '/project/then.test.mjs',
        signal: new AbortController().signal,
        onCollected(file) {
          try {
            sender.collected(file)
          } catch (error) {
            caught = true
            expect(error).toBe(original)
          }
        },
      },
      () => {}
    )
    expect(caught).toBe(true)
    expect(reads).toBe(1)
    await sender.finish()
    expect(reads).toBe(1)
  } finally {
    sender.dispose()
  }
})
