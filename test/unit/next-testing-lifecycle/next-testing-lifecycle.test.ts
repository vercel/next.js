import { execFile } from 'node:child_process'

import { promisify } from 'node:util'

import { join } from 'node:path'

it('serializes native and receiver-sensitive stack getters without mutating the raw failure', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'task-error-stack-accessors.cjs')],
    { timeout: 15000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    comparisons: 10,
    nativeEmptyNonemptyUndefined: true,
    originalGetterReceiverAndReadCounts: true,
    weakMapAndThrowingGetters: true,
    serializerWritesStayLocal: true,
    originalDescriptorsValuesAndCausePreserved: true,
    capturedAccessorInvocation: true,
  })
}, 20000)

it('preserves original error getter receivers and clone-local serializer writes', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'task-error-accessors.cjs')],
    { timeout: 15000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    comparisons: 22,
    untouchedOwnAndInheritedGetterReceivers: true,
    exactReadCountOrderAndThrowUndefined: true,
    ordinaryMethodDataPrototypeAndKeyOrder: true,
    nativeStackAndDescriptorMutation: true,
    setterWritesStayLocal: true,
    directSelfAndCauseCycles: true,
    capturedNewIntrinsics: true,
    postSetterGetterReceiverParityNotClaimed: true,
  })
}, 20000)

it('preserves original error aliases through the private serializer cache', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'task-error-aliases.cjs')],
    { timeout: 15000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    comparisons: 19,
    selfAndNestedAliases: 12,
    scalarReceiversAndExactGetterCounts: true,
    ordinaryAccessorReceiversRetained: true,
    primitivesNullCauseAndSharedArray: true,
    fallbackAndThrowUndefined: true,
    originalDescriptorsAndDataHeld: true,
    publicProcessErrorUnchanged: true,
  })
}, 20000)
