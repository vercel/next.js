const assert = require('node:assert/strict')
const createClientTransportFixture = require('./client-transport-fixture.cjs')
const { EventEmitter } = require('node:events')
const [mode, executePath] = process.argv.slice(2)
assert(
  [
    'success',
    'native-error',
    'wrong-value',
    'legacy-invalid',
    'cancel',
  ].includes(mode)
)
const invalid = mode === 'legacy-invalid'
const controller = new AbortController(),
  cancel = new Error('cancel owned native selection'),
  original = Object.assign(new Error('actual native selection rejection'), {
    name: 'TimeoutError',
  }),
  trace = [],
  selectors = [],
  selections = [],
  failures = []
let dispatch,
  operation,
  complete,
  admissions = 0,
  rejectNative,
  nativeJoined = false
const completion = new Promise((resolve) => {
    complete = resolve
  }),
  page = new EventEmitter()
page.locator = (selector) => {
  selectors.push(selector)
  return {
    fill: async (values, options) => {
      selections.push({ selector, values, options })
      if (mode === 'native-error' || mode === 'wrong-value') throw original
      if (mode === 'cancel')
        return new Promise((resolve, reject) => {
          rejectNative = reject
        }).finally(() => {
          nativeJoined = true
        })
      return values
    },
    click: async () => {
      trace.push('following-native-click')
    },
  }
}
page.goto = async () => {
  const values =
    mode === 'legacy-invalid' || mode === 'wrong-value' ? {} : 'filled'
  operation = dispatch(
    {
      method: 'fill',
      ...(invalid
        ? { element: 'next-test-element-7' }
        : {
            locator: {
              selector: '#fill-target',
              locator: 'actual fill target',
            },
          }),
      args: [values, { timeout: 50 }],
    },
    () => {
      admissions++
    }
  )
  if (invalid) {
    await assert.rejects(operation, /Invalid fill text/)
    assert.equal(admissions, 0)
    assert.equal(selections.length, 0)
  } else if (mode === 'native-error' || mode === 'wrong-value') {
    await assert.rejects(operation, (error) => {
      assert.equal(error.cause, original)
      assert.equal(error.actionError.name, 'TimeoutError')
      return true
    })
    await dispatch(
      { method: 'click', element: 'next-test-element-0', args: [] },
      () => {
        admissions++
      }
    )
  } else if (mode === 'cancel') {
    operation.catch(() => {})
    await new Promise(setImmediate)
    assert.equal(admissions, 1)
    assert.equal(selections.length, 1)
    controller.abort(cancel)
    return
  } else assert.equal(await operation, null)
  complete({})
}
const execute = createClientTransportFixture({
  executePath,
  page,
  trace,
  failures,
  completion,
  setDispatch(value) {
    dispatch = value
  },
  getOperation: () => operation,
  onRegisterSelectors: async () => {
    trace.push('register')
  },
  onConnect: () => trace.push('connect'),
  onNewContext: () => trace.push('new-context'),
  afterPageClose: () => {
    if (mode === 'cancel') rejectNative(cancel)
  },
})
;(async () => {
  const result = await execute({
    profileId: 'unit-selection',
    sourceFile: '/project/select.test.mjs',
    projectDir: '/project',
    signal: controller.signal,
    onEvent() {},
  })
  assert.equal(result.status, mode === 'cancel' ? 'cancelled' : 'passed')
  assert.equal(page.listenerCount('console'), 0)
  assert.equal(
    admissions,
    invalid ? 0 : mode === 'native-error' || mode === 'wrong-value' ? 2 : 1
  )
  assert.equal(
    selectors[0],
    invalid ? '[data-next-test-element="next-test-element-7"]' : '#fill-target'
  )
  assert.equal(selections.length, invalid ? 0 : 1)
  if (!invalid)
    assert.deepEqual(selections[0], {
      selector: selectors[0],
      values: mode === 'wrong-value' ? {} : 'filled',
      options: { timeout: 50 },
    })
  if (mode === 'native-error' || mode === 'wrong-value')
    assert(trace.includes('following-native-click'))
  if (mode === 'cancel') {
    assert(nativeJoined)
    await assert.rejects(operation, (error) => {
      assert.equal(error.cause, cancel)
      return true
    })
  }
  assert.deepEqual(
    trace.filter((value) => value.endsWith('-close')),
    ['context-close', 'browser-close', 'host-close', 'server-close']
  )
  assert.deepEqual(failures, [])
  console.log(
    JSON.stringify({
      mode,
      admissions,
      nativeFills: selections.length,
      actualNativeOptionsPreserved: true,
      legacyPrecheckPreservedAndRealValueInsideAdmission: true,
      originalErrorIdentityRetained: true,
      cleanupJoined: true,
    })
  )
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
