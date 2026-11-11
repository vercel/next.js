import assert from 'node:assert/strict'
import { beforeEach, it } from 'node:test'
import { createRequire } from 'node:module'
import { observeMocked } from './identity-observations'

// Genuine primitives initialize in this plain Node realm, never inside Jest's
// nonconfigurable matcher realm. These are component observers, not owner issuers.
const requireHere = createRequire(process.argv[1])
const commonPath = process.argv[2]
const clientPath = process.argv[3]
assert(
  commonPath && clientPath,
  'Both exact reviewed private facade paths are required'
)
let ownerLookups = 0
let browserAdmissions = 0

const runnerPath = requireHere.resolve('next/dist/experimental/testing/runner')
const actualRunner = requireHere(
  runnerPath
) as typeof import('next/dist/experimental/testing/runner')
const originalOwnerLookup = actualRunner.getAssertionRuntime
const runnerDescriptors = Object.getOwnPropertyDescriptors(actualRunner)
runnerDescriptors.getAssertionRuntime = {
  configurable: true,
  enumerable: true,
  writable: true,
  value: (...args: unknown[]) => {
    ownerLookups++
    return Reflect.apply(originalOwnerLookup, actualRunner, args)
  },
}
const runnerModule = requireHere.cache[runnerPath]
assert(runnerModule)
runnerModule.exports = Object.defineProperties(
  Object.create(Object.getPrototypeOf(actualRunner)),
  runnerDescriptors
)

const browserPath = requireHere.resolve(
  'next/dist/experimental/testing/client/async-context'
)
const actualBrowser = requireHere(
  browserPath
) as typeof import('next/dist/experimental/testing/client/async-context')
const originalBrowserAdmission = actualBrowser.assertBrowserApiScope
const browserDescriptors = Object.getOwnPropertyDescriptors(actualBrowser)
browserDescriptors.assertBrowserApiScope = {
  configurable: true,
  enumerable: true,
  writable: true,
  value: (...args: unknown[]) => {
    browserAdmissions++
    return Reflect.apply(originalBrowserAdmission, actualBrowser, args)
  },
}
const browserModule = requireHere.cache[browserPath]
assert(browserModule)
browserModule.exports = Object.defineProperties(
  Object.create(Object.getPrototypeOf(actualBrowser)),
  browserDescriptors
)

const common = requireHere(
  commonPath
) as typeof import('next/dist/experimental/testing/vitest')
const client = requireHere(
  clientPath
) as typeof import('next/dist/experimental/testing/client/vitest')
beforeEach(() => {
  ownerLookups = 0
  browserAdmissions = 0
})
;(
  [
    ['common', common.vi],
    ['client', client.vi],
  ] as const
).forEach(([name, facade]) => {
  it(`${name} mocked is an observation-free identity helper`, () => {
    const helper = facade.mocked
    assert.equal(ownerLookups, 0)
    assert.equal(browserAdmissions, 0)
    const observation = observeMocked(helper)
    assert.deepEqual(observation, {
      primitiveRows: 14,
      identities: Array(14).fill(true),
      optionRows: 16,
      optionIdentities: Array(16).fill(true),
      extraArgumentsIgnored: true,
      observations: Array.from({ length: 6 }, () => ({
        same: true,
        traps: 0,
        error: null,
      })),
      foreignReceiverIgnored: true,
      nonconstructable: true,
      name: 'mocked',
      length: 1,
      originalIsStillOrdinary: true,
    })
    assert.equal(ownerLookups, 0)
    assert.equal(browserAdmissions, 0)
  })
})

it('shares stable detached helpers across vi/vitest and the client facade', () => {
  const helper = common.vi.mocked
  const { mocked } = common.vi
  const item = { value: 1 }
  assert.equal(helper, common.vi.mocked)
  assert.equal(helper, common.vitest.mocked)
  assert.equal(helper, client.vi.mocked)
  assert.equal(helper, client.vitest.mocked)
  assert.equal(mocked(item), item)
  assert.equal(
    Reflect.apply(helper, { foreign: true }, [item, { deep: true }]),
    item
  )
  assert.equal(ownerLookups, 0)
  assert.equal(browserAdmissions, 0)
})

it('keeps get-time and call-time owner admission absent only for mocked', () => {
  const commonHelper = common.vi.mocked
  const clientHelper = client.vi.mocked
  assert.equal(ownerLookups, 0)
  assert.equal(browserAdmissions, 0)
  assert.equal(Object.is(commonHelper(null), null), true)
  assert.equal(Object.is(clientHelper(undefined), undefined), true)
  assert.equal(ownerLookups, 0)
  assert.equal(browserAdmissions, 0)
  assert.throws(
    () => common.vi.fn,
    /Assertion APIs require an initialized Next test file/
  )
  assert.equal(ownerLookups, 1)
  assert.throws(
    () => client.vi.fn,
    /Browser Mode API access requires its originating file, hook or test scope/
  )
  assert.equal(browserAdmissions, 1)
  assert.equal(ownerLookups, 1)
})

it('preserves non-thenability and unrelated unsupported/guarded utility access', () => {
  assert.equal(Reflect.get(common.vi, 'then'), undefined)
  assert.equal(Reflect.get(client.vi, 'then'), undefined)
  assert.equal(ownerLookups, 0)
  assert.equal(browserAdmissions, 0)
  assert.throws(() => Reflect.get(common.vi, 'notAMethod'), /vi.notAMethod/)
  assert.throws(
    () => Reflect.get(client.vi, 'notAMethod'),
    /Browser Mode API access requires its originating file, hook or test scope/
  )
  assert.equal(browserAdmissions, 1)
  assert.equal(ownerLookups, 0)
})
