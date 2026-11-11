import {
  assert,
  test,
  assertType,
  expectTypeOf,
  vi,
  createExpect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  aroundAll,
  aroundEach,
  type TestAPI,
  type TestContext,
  type ProvidedContext,
  type TestAnnotation,
  type Suite,
  type File,
} from 'next/experimental/testing/vitest'
assertType<number>(42)
expectTypeOf(42).toEqualTypeOf<number>()
assert.strictEqual('portable', 'portable')
const mock = vi.fn((value: number) => `${value}`)
expectTypeOf(mock(42)).toEqualTypeOf<string>()
// @ts-expect-error The value must satisfy the explicitly selected type.
assertType<string>(42)
// @ts-expect-error Incorrect type equality must remain an editor/compiler error.
expectTypeOf(42).toEqualTypeOf<string>()
// @ts-expect-error Typed mocks preserve their parameter types.
mock('invalid')

test('runtime skip types', (context) => {
  expectTypeOf(context.skip(false)).toEqualTypeOf<void>()
  if (false) {
    expectTypeOf(context.skip('reason')).toEqualTypeOf<never>()
    context.skip(true, 'conditional reason')
    // @ts-expect-error Skip conditions are booleans or reason strings.
    context.skip(1)
    // @ts-expect-error Skip notes must be strings.
    context.skip(true, 42)
  }
})

// The target accepts both retry forms and gives predicates serialized error fields.
test(
  'structured retry types',
  {
    retry: {
      count: 1,
      delay: 10,
      condition(error) {
        expectTypeOf(error.message).toEqualTypeOf<string>()
        expectTypeOf(error.actual).toEqualTypeOf<string | undefined>()
        return error.message.includes('transient')
      },
    },
  },
  () => {}
)
test('regexp retry types', { retry: { condition: /transient/ } }, () => {})
// @ts-expect-error Counts must be numbers.
test('invalid count', { retry: { count: 'two' } }, () => {})
// @ts-expect-error Conditions must be RegExp or predicates.
test('invalid condition', { retry: { condition: 'transient' } }, () => {})
// @ts-expect-error Predicates return a boolean, not a promise.
test('async condition', { retry: { condition: async () => true } }, () => {})

test('independent expectation types', ({ expect: local }) => {
  const manual = createExpect()
  local.assertions(1)
  local(42).toBe(42)
  manual('typed').toEqual('typed')
  expectTypeOf(local.getState().assertionCalls).toEqualTypeOf<number>()
  // @ts-expect-error Assertion counts must be numbers.
  local.assertions('one')
  // @ts-expect-error Factory task identities must be strings.
  createExpect({ id: 42 })
})

// The provided-context contract is independently augmentable for future inject users.
declare module 'next/experimental/testing/vitest' {
  interface ProvidedContext {
    releaseToken: string
  }
}
const api: TestAPI = test
void api
const provided: ProvidedContext = { releaseToken: 'typed' }
void provided

test('task and annotation types', async (context) => {
  expectTypeOf(context.task.id).toEqualTypeOf<string>()
  expectTypeOf(context.task.type).toEqualTypeOf<'test'>()
  expectTypeOf(context.expect).toEqualTypeOf<TestContext['expect']>()
  const note: TestAnnotation = await context.annotate('message', 'issue')
  await context.annotate('text', { body: 'body', bodyEncoding: 'utf-8' })
  expectTypeOf(note.message).toEqualTypeOf<string>()
  // @ts-expect-error Attachment encodings must match the declared contract.
  context.annotate('invalid', { body: 'body', bodyEncoding: 'hex' })
  // @ts-expect-error Messages must be strings.
  context.annotate(42)
})

// Public utilities return the complete facade, without private disposal methods.
const chained = vi
  .stubGlobal('publicTypeChain', 42)
  .stubEnv('PUBLIC_TYPE_CHAIN', '42')
  .clearAllMocks()
  .fn<(value: number) => number>()
expectTypeOf(chained).returns.toEqualTypeOf<number>()
expectTypeOf(vi.advanceTimersByTimeAsync(0)).toEqualTypeOf<Promise<typeof vi>>()
// @ts-expect-error private assertion resource disposal is not a public vi API
vi.stubGlobal('publicTypeChain', 42).dispose()

// Timer and wait declarations preserve generic callback values and truthiness.
vi.useFakeTimers({
  toNotFake: ['Date'],
  loopLimit: 100,
  shouldAdvanceTime: false,
})
vi.advanceTimersToNextTimer(2).runAllTicks().setTimerTickMode('manual')
vi.setTimerTickMode('interval', 20)
expectTypeOf(vi.waitFor(() => 42)).toEqualTypeOf<Promise<number>>()
expectTypeOf(vi.waitUntil(() => false as false | 'ready')).toEqualTypeOf<
  Promise<'ready'>
>()
vi.setSystemTime()
// @ts-expect-error Only timer names from the pinned engine are accepted.
vi.useFakeTimers({ toFake: ['invalidTimer'] })

// Runtime configuration mutates state and has void returns, unlike fluent utilities.
expectTypeOf(
  vi.setConfig({
    fakeTimers: { loopLimit: 2 },
    expect: { poll: { interval: 1, timeout: 5 } },
  })
).toEqualTypeOf<void>()
expectTypeOf(vi.resetConfig()).toEqualTypeOf<void>()
expectTypeOf(vi.dynamicImportSettled()).toEqualTypeOf<Promise<void>>()
// @ts-expect-error Runtime fake-timer configuration preserves timer-name restrictions.
vi.setConfig({ fakeTimers: { toFake: ['invalidTimer'] } })
// @ts-expect-error Retry is a collection option, not a runtime mutable field.
vi.setConfig({ retry: 2 })
createExpect().addEqualityTesters([
  function (a, b, testers) {
    return this.equals(a, b, testers)
  },
])

vi.setConfig({ maxConcurrency: 2, sequence: { hooks: 'parallel' } })
// @ts-expect-error Hook sequences are the pinned three values.
vi.setConfig({ sequence: { hooks: 'serial' } })

const builder = test.extend('value', () => 42)
builder('builder inference', ({ value }) =>
  expectTypeOf(value).toEqualTypeOf<number>()
)
const fileBuilder = test.extend(
  'connection',
  { scope: 'file' },
  async () => 'db'
)
const fixtureBuilder = fileBuilder.extend(
  'length',
  ({ connection }, { onCleanup }) => {
    onCleanup(() => {})
    return connection.length
  }
)
fixtureBuilder.beforeAll(({ connection }) =>
  expectTypeOf(connection).toEqualTypeOf<string>()
)
fixtureBuilder.afterAll(({ connection }) =>
  expectTypeOf(connection).toEqualTypeOf<string>()
)
fixtureBuilder.beforeEach(({ length, connection }) => {
  expectTypeOf(length).toEqualTypeOf<number>()
  expectTypeOf(connection).toEqualTypeOf<string>()
})
fixtureBuilder.override('length', ({ length }) => length + 1)
// @ts-expect-error Suite hooks cannot request test-scoped builder fixtures.
fixtureBuilder.beforeAll(({ length }) => length)
// @ts-expect-error File builders cannot depend on test-scoped builder fixtures.
fixtureBuilder.extend('otherFile', { scope: 'file' }, ({ length }) => length)
// @ts-expect-error Overrides preserve the original fixture value type.
fixtureBuilder.override('length', () => 'wrong')
// @ts-expect-error Builder overrides require an existing fixture.
fixtureBuilder.override('unknown', () => 1)
const scopedFixtures = test.extend<{
  $file: { connection: string }
  $test: { value: number }
}>({
  connection: [
    // eslint-disable-next-line no-empty-pattern -- File fixtures declare an empty dependency list.
    async ({}, provide) => provide('db'),
    { scope: 'file' },
  ],
  value: async ({ connection }, provide) => provide(connection.length),
})
scopedFixtures('scoped object fixture types', ({ connection, value }) => {
  expectTypeOf(connection).toEqualTypeOf<string>()
  expectTypeOf(value).toEqualTypeOf<number>()
})
scopedFixtures.beforeAll(({ connection }) =>
  expectTypeOf(connection).toEqualTypeOf<string>()
)

// Object extensions replace inherited value types and retain the old value only
// for their own dependency, while peer dependencies use the new definitions.
const flatOriginal = test.extend<{ value: string; peer: string }>({
  value: 'old',
  peer: 'old peer',
})
const flatReplacement = flatOriginal.extend<{ value: number; peer: boolean }>({
  value: async ({ value, peer }, provide) => {
    expectTypeOf(value).toEqualTypeOf<string>()
    expectTypeOf(peer).toEqualTypeOf<boolean>()
    await provide(value.length + Number(peer))
  },
  peer: true,
})
flatReplacement('object replacement types', ({ value, peer }) => {
  expectTypeOf(value).toEqualTypeOf<number>()
  expectTypeOf(peer).toEqualTypeOf<boolean>()
})
const callableFixture = test.extend<{ callback: () => number }>({
  // eslint-disable-next-line no-empty-pattern -- This fixture declares no dependencies.
  callback: async ({}, provide) => provide(() => 42),
})
callableFixture('callable fixture types', ({ callback }) =>
  expectTypeOf(callback()).toEqualTypeOf<number>()
)
test.extend<{ value: number }>({
  // @ts-expect-error A new flat fixture cannot depend on itself without a base.
  value: async ({ value }, provide) => provide(value),
})
test.extend<{ callback: () => number }>({
  // @ts-expect-error Functions define factories; callable values must go through use.
  callback: () => 42,
})
// @ts-expect-error An unmarked flat test fixture cannot feed a file builder.
flatOriginal.extend('fileValue', { scope: 'file' }, ({ value }) => value)
// @ts-expect-error Scoped file tuples require a factory with a file context.
test.extend<{ $file: { value: number } }>({
  value: [1, { scope: 'file' }],
})
test.extend<{ $test: { value: number } }>({
  // @ts-expect-error Scoped test tuples require a factory; bare values remain valid.
  value: [1, { scope: 'test' }],
})

// Literal constructors and branded callables follow the pinned fixture overloads.
class FixtureResource {
  value = 42
}
const constructorBuilder = test.extend('resource', FixtureResource)
constructorBuilder('constructor builder types', ({ resource }) =>
  expectTypeOf(resource).toEqualTypeOf<typeof FixtureResource>()
)
constructorBuilder.override('resource', FixtureResource)
const constructorFileBuilder = test.extend(
  'resource',
  { scope: 'file' },
  FixtureResource
)
constructorFileBuilder.beforeAll(({ resource }) =>
  expectTypeOf(resource).toEqualTypeOf<typeof FixtureResource>()
)
constructorFileBuilder.override('resource', { scope: 'file' }, FixtureResource)
const constructorObject = test.extend<{ resource: typeof FixtureResource }>({
  resource: FixtureResource,
})
constructorObject('constructor object types', ({ resource }) =>
  expectTypeOf(resource).toEqualTypeOf<typeof FixtureResource>()
)
const fixtureConstructor: new () => { value: number } = FixtureResource
const constructSignatureObject = test.extend<{
  resource: typeof fixtureConstructor
}>({ resource: fixtureConstructor })
constructSignatureObject('construct signature types', ({ resource }) =>
  expectTypeOf(resource).toEqualTypeOf<typeof fixtureConstructor>()
)
const brandedFixture = Object.assign((value: number) => value, {
  brand: true as const,
})
const brandedObject = test.extend<{ callback: typeof brandedFixture }>({
  callback: brandedFixture,
})
brandedObject('branded callable types', ({ callback }) =>
  expectTypeOf(callback).toEqualTypeOf<typeof brandedFixture>()
)
test.extend<{ value: any }>({
  // @ts-expect-error An unconstrained fixture value must be supplied by a factory.
  value: 42,
})
test.extend<{ value: unknown }>({
  // @ts-expect-error An unknown fixture value must be supplied by a factory.
  value: 42,
})

const implicitObjectFactory = test.extend({
  // eslint-disable-next-line no-empty-pattern -- This fixture declares no dependencies.
  value: async ({}, provide) => provide(42),
})
implicitObjectFactory('implicit factory inference', ({ value }) =>
  expectTypeOf(value).toEqualTypeOf<unknown>()
)
const implicitReplacementFactory = test.extend({ value: 'old' }).extend({
  value: async ({ value }, provide) => {
    expectTypeOf(value).toEqualTypeOf<string>()
    await provide(value.length)
  },
})
implicitReplacementFactory('implicit replacement inference', ({ value }) =>
  expectTypeOf(value).toEqualTypeOf<unknown>()
)

// Worker fixtures retain their own type context above file and test scopes.
const workerBuilder = test.extend('port', { scope: 'worker' }, () => 42)
const workerAndFile = workerBuilder.extend(
  'connection',
  { scope: 'file' },
  ({ port }) => String(port)
)
workerAndFile.beforeAll(({ port, connection }) => {
  expectTypeOf(port).toEqualTypeOf<number>()
  expectTypeOf(connection).toEqualTypeOf<string>()
})
workerAndFile.extend('nextPort', { scope: 'worker' }, ({ port }) => port + 1)
// @ts-expect-error Worker builders cannot depend on narrower file values.
workerAndFile.extend('bad', { scope: 'worker' }, ({ connection }) => connection)
// @ts-expect-error Worker builders have no attempt assertion context.
workerBuilder.extend('badContext', { scope: 'worker' }, ({ expect }) => expect)
const scopedWorker = test.extend<{
  $worker: { port: number }
  $file: { connection: string }
}>({
  // eslint-disable-next-line no-empty-pattern -- This worker fixture has no dependencies.
  port: [async ({}, use) => use(42), { scope: 'worker' }],
  connection: [async ({ port }, use) => use(String(port)), { scope: 'file' }],
})
scopedWorker('worker and file values', ({ port, connection }) => {
  expectTypeOf(port).toEqualTypeOf<number>()
  expectTypeOf(connection).toEqualTypeOf<string>()
})

// Tagged tables use the target's dynamic row type while preserving fixture context.
import { describe as taggedDescribe } from 'next/experimental/testing/vitest'
test.each`
  left | right
  ${1} | ${2}
`('tagged each $left', ({ left, right }) => {
  expectTypeOf(left).toEqualTypeOf<any>()
  expectTypeOf(right).toEqualTypeOf<any>()
})
const taggedFixture = test.extend<{ label: string }>({ label: 'typed' })
taggedFixture.for`value
  ${42}
`(
  'tagged for $value',
  { retry: 0 },
  ({ value }, { label, signal, expect: local }) => {
    expectTypeOf(value).toEqualTypeOf<any>()
    expectTypeOf(label).toEqualTypeOf<string>()
    expectTypeOf(signal).toEqualTypeOf<AbortSignal>()
    expectTypeOf(local).toEqualTypeOf<TestContext['expect']>()
  }
)
taggedDescribe.each`value
  ${42}
`('tagged suite each $value', ({ value }) => {
  expectTypeOf(value).toEqualTypeOf<any>()
})
taggedDescribe.for`value
  ${42}
`('tagged suite for $value', { retry: 0 }, ({ value }) => {
  expectTypeOf(value).toEqualTypeOf<any>()
})

// Global hooks accept the target's explicit context type parameters.
if (false) {
  type ExtraHookContext = { label: string }
  beforeAll<ExtraHookContext>(({ label }, owner) => {
    expectTypeOf(label).toEqualTypeOf<string>()
    expectTypeOf(owner).toEqualTypeOf<Readonly<Suite | File>>()
  })
  afterAll<ExtraHookContext>(({ label }, owner) => {
    expectTypeOf(label).toEqualTypeOf<string>()
    expectTypeOf(owner).toEqualTypeOf<Readonly<Suite | File>>()
  })
  beforeEach<ExtraHookContext>(({ label, task }, owner) => {
    expectTypeOf(label).toEqualTypeOf<string>()
    expectTypeOf(task).toEqualTypeOf<TestContext['task']>()
    expectTypeOf(owner).toEqualTypeOf<Readonly<Suite>>()
  })
  afterEach<ExtraHookContext>(({ label, signal }, owner) => {
    expectTypeOf(label).toEqualTypeOf<string>()
    expectTypeOf(signal).toEqualTypeOf<AbortSignal>()
    expectTypeOf(owner).toEqualTypeOf<Readonly<Suite>>()
  })
  aroundEach<ExtraHookContext>(async (runTest, { label, task }, owner) => {
    expectTypeOf(runTest).toEqualTypeOf<() => Promise<void>>()
    expectTypeOf(label).toEqualTypeOf<string>()
    expectTypeOf(task).toEqualTypeOf<TestContext['task']>()
    expectTypeOf(owner).toEqualTypeOf<Readonly<Suite>>()
    await runTest()
  })
  aroundAll<ExtraHookContext>(async (runSuite, { label }, owner) => {
    expectTypeOf(runSuite).toEqualTypeOf<() => Promise<void>>()
    expectTypeOf(label).toEqualTypeOf<string>()
    expectTypeOf(owner).toEqualTypeOf<Readonly<Suite | File>>()
    await runSuite()
  })
  beforeAll((context) => {
    expectTypeOf(context).toEqualTypeOf<object>()
    // @ts-expect-error A global suite hook does not receive an attempt context.
    void context.task
  })
}

if (false) {
  const aliased = test.extend<{ label: string }>({ label: 'base' })
  aliased.describe('typed describe alias', () => {
    aliased('fixture types', ({ label }) => {
      expectTypeOf(label).toEqualTypeOf<string>()
    })
  })
  aliased.suite.each([42])('typed suite alias %i', (value) => {
    expectTypeOf(value).toEqualTypeOf<number>()
  })
  expectTypeOf(aliased.scoped({ label: 'override' })).toEqualTypeOf<
    TestAPI<{ label: string }>
  >()
  // @ts-expect-error Existing fixture types remain enforced through scoped().
  aliased.scoped({ label: 42 })
}

if (false) {
  test.describe('typed suite factory', (provided) => {
    const api: typeof test = provided
    const custom = api.extend<{ token: number }>({ token: 7 })
    custom('typed fixture', ({ token }) => {
      expectTypeOf(token).toEqualTypeOf<number>()
    })
    provided.beforeEach(({ expect }) => {
      expect(1).toBe(1)
    })
    // @ts-expect-error Provided APIs preserve declared fixture types.
    custom('wrong', ({ missing }) => {})
  })
  test.describe('async typed suite factory', async (provided) => {
    await Promise.resolve()
    provided('after await', ({ expect }) => {
      expect(2).toBe(2)
    })
  })
}

const prototypeNamedFixtures = test.extend<{
  toString: string
  constructor: { tag: string }
  hasOwnProperty: number
  __proto__: { count: number }
}>({
  toString: 'text',
  constructor: { tag: 'base' },
  hasOwnProperty: 3,
  ['__proto__']: { count: 5 },
})
prototypeNamedFixtures.extend(
  'hasOwnProperty',
  ({ __proto__, hasOwnProperty }) => __proto__.count + hasOwnProperty
)(
  'typed object-prototype fixture names',
  ({ toString, constructor, hasOwnProperty, __proto__ }) => {
    expectTypeOf(toString).toEqualTypeOf<string>()
    expectTypeOf(constructor.tag).toEqualTypeOf<string>()
    expectTypeOf(hasOwnProperty).toEqualTypeOf<number>()
    expectTypeOf(__proto__.count).toEqualTypeOf<number>()
  }
)

// Public helper authors can name the same options and callback types as callers.
import type {
  SuiteOptions,
  TestOptions,
  TestFunction,
} from 'next/experimental/testing/vitest'
const publicCaseOptions: TestOptions = {
  timeout: 2000,
  retry: 0,
  repeats: 0,
  concurrent: false,
  meta: {},
}
const publicSuiteOptions: SuiteOptions = {
  ...publicCaseOptions,
  shuffle: false,
}
function registerPublicCallback<Context extends object>(
  api: TestAPI<Context>,
  callback: TestFunction<Context>
) {
  api('typed public helper', publicCaseOptions, callback)
}
const publicFixtureApi = test.extend('amount', () => 4)
const publicFixtureCallback: TestFunction<{ amount: number }> = async ({
  amount,
  expect,
  task,
}) => {
  await Promise.resolve()
  expectTypeOf(amount).toEqualTypeOf<number>()
  expectTypeOf(task.name).toEqualTypeOf<string>()
  expect(amount).toBe(4)
}
registerPublicCallback(publicFixtureApi, publicFixtureCallback)
expectTypeOf(publicSuiteOptions.shuffle).toEqualTypeOf<boolean | undefined>()
type PublicCallbackAmount = Parameters<
  TestFunction<{ amount: number }>
>[0]['amount']
const publicCallbackAmount: PublicCallbackAmount = 4
// @ts-expect-error Generic callback fixture values keep their declared type.
const invalidPublicCallbackAmount: PublicCallbackAmount = 'wrong'
const invalidPublicCaseOptions: TestOptions = {
  // @ts-expect-error Case deadlines require a number.
  timeout: 'bad',
}
const invalidPublicSuiteOptions: SuiteOptions = {
  // @ts-expect-error Suite shuffle requires a boolean.
  shuffle: 'bad',
}
void publicCallbackAmount
void invalidPublicCallbackAmount
void invalidPublicCaseOptions
void invalidPublicSuiteOptions

// Public listeners keep their named handler types and Awaitable<void> result.
import {
  onTestFinished as publicFinished,
  onTestFailed as publicFailed,
  type OnTestFinishedHandler,
  type OnTestFailedHandler,
} from 'next/experimental/testing/vitest'
const finishedHandler: OnTestFinishedHandler = async ({ task, signal }) => {
  const name: string = task.name
  const aborted: boolean = signal.aborted
  void name
  void aborted
}
const failedHandler: OnTestFailedHandler = ({ task }) => {
  const name: string = task.name
  void name
}
// @ts-expect-error Public handler aliases require Awaitable<void>.
const invalidFinished: OnTestFinishedHandler = async () => 1
// @ts-expect-error Public handler aliases require Awaitable<void>.
const invalidFailed: OnTestFailedHandler = () => 1
test('public listener declarations', ({ onTestFinished, onTestFailed }) => {
  onTestFinished(finishedHandler)
  onTestFailed(failedHandler)
  publicFinished(finishedHandler)
  publicFailed(failedHandler)
  // @ts-expect-error Context listeners retain the target return constraint.
  onTestFinished(async () => 1)
  // @ts-expect-error Context listeners retain the target return constraint.
  onTestFailed(() => 1)
  // @ts-expect-error Global listeners retain the target return constraint.
  publicFinished(async () => 1)
  // @ts-expect-error Global listeners retain the target return constraint.
  publicFailed(() => 1)
})
const listenerFixture = test.extend<{ value: number }>({ value: 1 })
listenerFixture.concurrent.for([1])(
  'fixture listener %i',
  (_item, { value, onTestFinished }) => {
    const fixtureValue: number = value
    void fixtureValue
    // @ts-expect-error Modified/table/fixture APIs retain the public context.
    onTestFinished(() => value)
  }
)
test.describe('listener suite factory', (owned) => {
  owned('factory listener context', ({ onTestFailed }) => {
    // @ts-expect-error Suite factories retain the public context.
    onTestFailed(() => 1)
  })
})
void invalidFinished
void invalidFailed

// Public suite factories retain callback fixture inference and awaitable void.
import {
  describe as factoryDescribe,
  type SuiteFactory,
  type TestAPI as FactoryTestAPI,
} from 'next/experimental/testing/vitest'
{
  const direct: SuiteFactory = (api) => {
    const equivalent: FactoryTestAPI = api
    equivalent('factory context', ({ expect }) => expect(true).toBe(true))
  }
  const generic: SuiteFactory<{ token: string }> = async (api) => {
    api('generic factory context', ({ token }) => {
      assertType<string>(token)
      // @ts-expect-error The callback retains the selected fixture value type.
      assertType<number>(token)
    })
  }
  const fulfilled: PromiseLike<void> = Promise.resolve()
  const thenable: SuiteFactory = () => fulfilled
  // @ts-expect-error Factories resolve void, rather than arbitrary values.
  const invalidReturn: SuiteFactory = () => 42
  // @ts-expect-error Factories receive a test API, rather than a test context.
  const invalidParameter: SuiteFactory = ({ expect }) => {
    expect(true).toBe(true)
  }
  // @ts-expect-error Generic fixture declarations preserve value types.
  const invalidGeneric: SuiteFactory<{ token: string }> = (
    api: FactoryTestAPI<{ token: number }>
  ) => {}
  const primitive: SuiteFactory<string> = (api) => {
    api('primitive intersection', (context) => {
      assertType<string>(context)
    })
  }
  factoryDescribe('default factory', direct)
  factoryDescribe('thenable factory', thenable)
  factoryDescribe('generic factory', generic)
  factoryDescribe<{ token: string }>('generic options factory', {}, generic)
  void primitive
  void invalidReturn
  void invalidParameter
  void invalidGeneric
}

// Boolean environment flag names retain their value constraint through the facade.
const environmentFacade: typeof vi = vi.stubEnv('DEV', true).unstubAllEnvs()
vi.stubEnv('PROD', false)
vi.stubEnv('SSR', undefined)
vi.stubEnv('ordinary', 'controlled')
vi.stubEnv('dev', 'true')
// @ts-expect-error Boolean environment flags accept booleans rather than strings.
vi.stubEnv('DEV', 'false')
// @ts-expect-error Ordinary environment names accept strings rather than booleans.
vi.stubEnv('ordinary', false)
// @ts-expect-error Boolean flag classification is case sensitive.
vi.stubEnv('dev', true)
// @ts-expect-error Environment values are not numbers.
vi.stubEnv('ordinary', 42)
// @ts-expect-error The public fluent return does not expose private disposal.
vi.stubEnv('SSR', true).dispose()
void environmentFacade

// Only interval tick mode accepts a numeric interval argument.
{
  const manual: typeof vi = vi.setTimerTickMode('manual')
  const automatic: typeof vi = vi.setTimerTickMode('nextTimerAsync')
  const interval: typeof vi = vi.setTimerTickMode('interval')
  const customInterval: typeof vi = vi.setTimerTickMode('interval', 12)
  const detached = vi.setTimerTickMode
  const detachedInterval: typeof vi = detached('interval', 20)
  // @ts-expect-error Manual mode does not accept an interval argument.
  vi.setTimerTickMode('manual', 12)
  // @ts-expect-error nextTimerAsync mode does not accept an interval argument.
  vi.setTimerTickMode('nextTimerAsync', 12)
  // @ts-expect-error Even an undefined second argument belongs only to interval mode.
  vi.setTimerTickMode('manual', undefined)
  // @ts-expect-error Intervals use numbers.
  vi.setTimerTickMode('interval', '12')
  // @ts-expect-error Only the supported mode literals are admitted.
  vi.setTimerTickMode('automatic')
  // @ts-expect-error Fluent public utilities do not expose the private disposer.
  vi.setTimerTickMode('interval', 12).dispose()
  void [manual, automatic, interval, customInterval, detachedInterval]
}
