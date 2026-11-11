import { openTestConfigModule } from 'next/dist/experimental/testing/config-modules'
import { runTestProcess } from 'next/dist/experimental/testing/execution/process'

jest.mock('next/dist/experimental/testing/execution/process', () => ({
  runTestProcess: jest.fn(),
}))

function transport() {
  let options: any
  let finish!: (result: unknown) => void
  let sendFailure: Error | undefined
  let metadata: unknown = true
  const messages: any[] = []
  const send = jest.fn(async (message: any) => {
    messages.push(message)
    if (sendFailure) throw sendFailure
    if (message.type === 'watch-triggers') {
      options.onMessage({
        type: 'test-config-result',
        ...(metadata === undefined
          ? {}
          : { watchTriggerInputsCurrent: metadata }),
        value: message.files.map((source: string) => ({
          source,
          matched: true,
          tests: ['/project/alpha.test.mjs'],
        })),
      })
    } else if (message.type === 'shutdown') {
      options.onMessage({ type: 'test-config-result' })
      setImmediate(() => finish({ reason: 'exit', code: 0 }))
    }
  })
  jest
    .mocked(runTestProcess)
    .mockImplementation((_file: string, input: any) => {
      options = input
      options.onReady(send)
      options.signal.addEventListener(
        'abort',
        () => finish({ reason: 'cancelled', code: 130 }),
        { once: true }
      )
      const result = new Promise((resolve) => {
        finish = resolve
      })
      queueMicrotask(() =>
        options.onMessage({
          type: 'test-config-loaded',
          value: { test: {} },
          watchTriggers: { inputs: ['/project/vitest.config.mjs'] },
        })
      )
      return result as ReturnType<typeof runTestProcess>
    })
  return {
    messages,
    releaseOrdinary(value: unknown) {
      options.onMessage({ type: 'test-config-result', value })
    },
    failNextSend(error: Error) {
      sendFailure = error
    },
    setMetadata(value: unknown) {
      metadata = value
    },
  }
}

afterEach(() => jest.clearAllMocks())

it('waits for the actual ordinary request before invoking the owned evaluator', async () => {
  const channel = transport()
  const realm = await openTestConfigModule(
    '/project/vitest.config.mjs',
    '/project'
  )
  expect(realm.hasWatchTriggers).toBe(true)
  expect(realm.watchTriggerInputs).toEqual(['/project/vitest.config.mjs'])
  const ordinary = realm.setup([
    { name: 'default', globalSetup: [], provide: {} },
  ])
  const mapped = realm.evaluateWatchTriggers(['/project/payload.txt'])
  await Promise.resolve()
  expect(channel.messages.map((message) => message.type)).toEqual(['setup'])
  const contexts = { default: { actual: 'ordinary result' } }
  channel.releaseOrdinary(contexts)
  expect(await ordinary).toBe(contexts)
  expect(await mapped).toEqual([
    {
      source: '/project/payload.txt',
      matched: true,
      tests: ['/project/alpha.test.mjs'],
    },
  ])
  expect(channel.messages.map((message) => message.type)).toEqual([
    'setup',
    'watch-triggers',
  ])
  await realm.dispose()
})

it('revokes an evaluator waiting behind an ordinary request before disposal', async () => {
  const channel = transport()
  const realm = await openTestConfigModule(
    '/project/vitest.config.mjs',
    '/project'
  )
  const ordinary = realm.setup([
    { name: 'default', globalSetup: [], provide: {} },
  ])
  const ordinaryFailure = ordinary.catch((error) => error)
  const mapped = realm.evaluateWatchTriggers(['/project/payload.txt'])
  const mapperFailure = mapped.catch((error) => error)
  await Promise.resolve()
  const disposalFailure = realm.dispose().catch((error) => error)
  expect((await mapperFailure).message).toBe(
    'Watch trigger configuration owner is closed.'
  )
  const failure = await ordinaryFailure
  expect(await disposalFailure).toBe(failure)
  expect(channel.messages.map((message) => message.type)).toEqual(['setup'])
})

it('retains the actual ordinary send Error for its caller and queued evaluator after abort', async () => {
  const channel = transport()
  const realm = await openTestConfigModule(
    '/project/vitest.config.mjs',
    '/project'
  )
  const error = new Error('actual ordinary request transport failure')
  channel.failNextSend(error)
  const ordinary = realm.setup([
    { name: 'default', globalSetup: [], provide: {} },
  ])
  const mapped = realm.evaluateWatchTriggers(['/project/payload.txt'])
  const failures = await Promise.all([
    ordinary.catch((value) => value),
    mapped.catch((value) => value),
  ])
  expect(failures).toEqual([error, error])
  expect(failures[0]).toBe(error)
  expect(failures[1]).toBe(error)
  expect(channel.messages.map((message) => message.type)).toEqual(['setup'])
  await expect(realm.dispose()).rejects.toThrow()
})

it('rechecks the actual observation abort after waiting without starting a mapper request', async () => {
  const channel = transport()
  const realm = await openTestConfigModule(
    '/project/vitest.config.mjs',
    '/project'
  )
  const ordinary = realm.setup([
    { name: 'default', globalSetup: [], provide: {} },
  ])
  const controller = new AbortController()
  const reason = new Error('actual observation was superseded')
  const mapped = realm.evaluateWatchTriggers(
    ['/project/payload.mjs'],
    controller.signal
  )
  const failure = mapped.catch((error) => error)
  await Promise.resolve()
  controller.abort(reason)
  expect(await failure).toBe(reason)
  expect(channel.messages.map((message) => message.type)).toEqual(['setup'])
  channel.releaseOrdinary({ default: {} })
  await ordinary
  await realm.dispose()
})

it.each([true, false, undefined, 0, 'true'])(
  'certifies only truthful live-input metadata: %j',
  async (metadata) => {
    const channel = transport()
    const realm = await openTestConfigModule(
      '/project/vitest.config.mjs',
      '/project'
    )
    try {
      expect(realm.watchTriggerInputsCurrent).toBe(false)
      channel.setMetadata(metadata)
      await realm.evaluateWatchTriggers(['/project/payload.mjs'])
      expect(realm.watchTriggerInputsCurrent).toBe(metadata === true)
      channel.setMetadata(true)
      await realm.evaluateWatchTriggers(['/project/payload.mjs'])
      expect(realm.watchTriggerInputsCurrent).toBe(metadata === true)
    } finally {
      await realm.dispose()
    }
  }
)
