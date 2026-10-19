import { test, expect, vi } from 'vitest'
import { observe } from './observe.mjs'

const returned = { result: 'same' }
const receiver = { receiver: 'same' }
let syncReceiver
let syncArguments
const sync = vi.defineHelper(function originalSync(...args) {
  syncReceiver = this
  syncArguments = args
  return returned
})
const syncFailure = vi.defineHelper((value) => {
  throw value
})
const inner = vi.defineHelper((value) => expect(value).toBe('expected'))
const outer = vi.defineHelper((value) => inner(value))
const asyncAssertion = vi.defineHelper(async (value) => {
  await Promise.resolve()
  expect(value).toBe('expected')
})
let originalSoftReturn
const soft = vi.defineHelper((value) => {
  originalSoftReturn = expect.soft(value).toBe('expected')
  return originalSoftReturn
})

test('sync helper preserves module creation receiver arguments and payloads', () => {
  const argument = { argument: 'same' }
  const result = sync.call(receiver, argument, 7)
  const error = new Error('original sync error')
  const oldStack = error.stack
  let caughtError
  let caughtPrimitive
  try {
    syncFailure(error)
  } catch (value) {
    caughtError = value
  }
  try {
    syncFailure(37)
  } catch (value) {
    caughtPrimitive = value
  }
  observe('sync', {
    helperType: typeof sync,
    helperName: sync.name,
    helperLength: sync.length,
    receiverSame: syncReceiver === receiver,
    argumentsLength: syncArguments.length,
    argumentSame: syncArguments[0] === argument,
    secondArgument: syncArguments[1],
    returnSame: result === returned,
    errorSame: caughtError === error,
    errorStackUnchanged: caughtError.stack === oldStack,
    primitive: caughtPrimitive,
    assertionCalls: expect.getState().assertionCalls,
  })
})

test('async helper preserves values receiver thenables and rejected payloads', async () => {
  const argument = { async: 'same' }
  let asyncReceiver
  let asyncArgument
  const fulfilled = vi.defineHelper(async function originalAsync(value) {
    asyncReceiver = this
    asyncArgument = value
    await Promise.resolve()
    return returned
  })
  const fulfillment = fulfilled.call(receiver, argument)
  const fulfilledValue = await fulfillment
  let thenCalls = 0
  const objectThenable = {
    then(resolve) {
      thenCalls++
      resolve(returned)
    },
  }
  const thenable = vi.defineHelper(() => objectThenable)()
  const thenableValue = await thenable
  let functionThenCalls = 0
  function functionThenable() {}
  functionThenable.then = () => {
    functionThenCalls++
  }
  const functionValue = vi.defineHelper(() => functionThenable)()
  const error = new Error('original async error')
  const oldStack = error.stack
  const rejected = vi.defineHelper(async () => {
    await Promise.resolve()
    throw error
  })
  let caughtError
  let caughtPrimitive
  try {
    await rejected()
  } catch (value) {
    caughtError = value
  }
  const primitive = Symbol('same rejection')
  try {
    await vi.defineHelper(() => Promise.reject(primitive))()
  } catch (value) {
    caughtPrimitive = value
  }
  observe('async', {
    returnPromise: fulfillment instanceof Promise,
    returnSame: fulfilledValue === returned,
    receiverSame: asyncReceiver === receiver,
    argumentSame: asyncArgument === argument,
    objectThenablePromise: thenable instanceof Promise,
    objectThenableSame: thenable === objectThenable,
    thenableValueSame: thenableValue === returned,
    thenCalls,
    functionThenableSame: functionValue === functionThenable,
    functionThenCalls,
    errorSame: caughtError === error,
    errorMessage: caughtError.message,
    errorStackChanged: caughtError.stack !== oldStack,
    errorStackHasHelper: caughtError.stack.includes('__VITEST_HELPER__'),
    errorStackMessage: caughtError.stack.split('\n')[0],
    primitiveSame: caughtPrimitive === primitive,
    assertionCalls: expect.getState().assertionCalls,
  })
})

test('nested helper failure reports the outer caller', () => {
  observe('nested-before', { assertionCalls: expect.getState().assertionCalls })
  outer('actual nested')
})

test('async helper failure reports the caller after suspension', async () => {
  observe('async-before', { assertionCalls: expect.getState().assertionCalls })
  await asyncAssertion('actual async')
})

test('soft helper failure continues and reports its caller', () => {
  const result = soft('actual soft')
  observe('soft-after', {
    continued: true,
    returnUndefined: result === undefined,
    originalReturnType: typeof originalSoftReturn,
    returnType: typeof result,
    returnSame: result === originalSoftReturn,
    originalThenType:
      originalSoftReturn == null ? 'none' : typeof originalSoftReturn.then,
    returnThenType: result == null ? 'none' : typeof result.then,
    assertionCalls: expect.getState().assertionCalls,
  })
})
