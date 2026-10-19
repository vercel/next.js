import { types } from 'util'

/** Held-directory observation only; this supplies no compiler or allocation authority. */
export interface TestSnapshotDirectoryDeletionIdentity {
  device: string
  inode: string
}
export interface TestSnapshotDirectoryDeletionCapability {
  version: 1
  platformSupported: boolean
}
export interface TestSnapshotDirectoryDeletionObservation
  extends TestSnapshotDirectoryDeletionIdentity {
  version: 1
  deleted: boolean
  revoked: boolean
  uncertain: boolean
  errors: readonly string[]
}
export interface TestSnapshotDirectoryDeletionClosure {
  version: 1
  duplicateClosed: boolean
  queueClosed: boolean
  uncertain: boolean
  errors: readonly string[]
}
export interface TestSnapshotDirectoryDeletionWatch {
  poll(): TestSnapshotDirectoryDeletionObservation
  close(): TestSnapshotDirectoryDeletionClosure
}
export interface TestSnapshotDirectoryDeletionMethods {
  testSnapshotDirectoryDeletionCapability(): TestSnapshotDirectoryDeletionCapability
  testSnapshotWatchDirectoryDeletion(
    heldStageFd: number,
    expectedIdentity: TestSnapshotDirectoryDeletionIdentity
  ): TestSnapshotDirectoryDeletionWatch
}

const freeze = Object.freeze
const apply = Reflect.apply
const descriptor = Object.getOwnPropertyDescriptor
const prototype = Object.getPrototypeOf
const ownKeys = Reflect.ownKeys
const hasOwn = Object.hasOwn
const isArray = Array.isArray
const isPromise = types.isPromise
const objectPrototype = Object.prototype
const functionPrototype = Function.prototype

function fail(kind: string, reason: string): never {
  throw new Error(`ERR_NEXT_TEST_SNAPSHOT_DELETION_${kind}: ${reason}`)
}

function fields(value: unknown, keys: readonly string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    isPromise(value) ||
    ![objectPrototype, null].includes(prototype(value))
  )
    fail('INVALID', 'invalid native directory-deletion result shape')
  const names = ownKeys(value)
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail('INVALID', 'invalid native directory-deletion result fields')
  const data: Record<string, unknown> = { __proto__: null }
  for (const key of keys) {
    const field = descriptor(value, key)
    if (!field || !hasOwn(field, 'value') || !field.enumerable)
      fail('INVALID', 'native directory-deletion fields must be own data')
    data[key] = field.value
  }
  return data
}

function identity(value: unknown): TestSnapshotDirectoryDeletionIdentity {
  const data = fields(value, ['device', 'inode'])
  for (const item of [data.device, data.inode])
    if (
      typeof item !== 'string' ||
      !/^(?:0|[1-9][0-9]*)$/.test(item) ||
      item.length > 20 ||
      BigInt(item) > BigInt('18446744073709551615')
    )
      fail('INVALID', 'identity must contain canonical u64 decimal strings')
  if (data.inode === '0') fail('INVALID', 'directory inode must be nonzero')
  const copy = {
    __proto__: null,
    device: data.device as string,
    inode: data.inode as string,
  }
  freeze(copy)
  return copy
}

function errors(value: unknown): readonly string[] {
  if (!isArray(value)) fail('INVALID', 'native errors must be an array')
  const length = descriptor(value, 'length')
  if (
    !length ||
    !hasOwn(length, 'value') ||
    !Number.isInteger(length.value) ||
    length.value < 0 ||
    length.value > 8 ||
    ownKeys(value).length !== length.value + 1
  )
    fail('INVALID', 'native errors must be a bounded dense array')
  const copy: string[] = []
  for (let index = 0; index < length.value; index++) {
    const item = descriptor(value, String(index))
    if (
      !item ||
      !hasOwn(item, 'value') ||
      !item.enumerable ||
      typeof item.value !== 'string' ||
      item.value.length === 0 ||
      copy.includes(item.value)
    )
      fail('INVALID', 'native errors must be unique nonempty own data strings')
    copy.push(item.value)
  }
  freeze(copy)
  return copy
}

function observation(
  value: unknown,
  expected: TestSnapshotDirectoryDeletionIdentity
): TestSnapshotDirectoryDeletionObservation {
  const data = fields(value, [
    'version',
    'device',
    'inode',
    'deleted',
    'revoked',
    'uncertain',
    'errors',
  ])
  const actual = identity({ device: data.device, inode: data.inode })
  if (actual.device !== expected.device || actual.inode !== expected.inode)
    fail('IDENTITY', 'native observation returned another directory identity')
  const reasons = errors(data.errors)
  if (
    data.version !== 1 ||
    typeof data.deleted !== 'boolean' ||
    typeof data.revoked !== 'boolean' ||
    typeof data.uncertain !== 'boolean' ||
    data.uncertain !== (reasons.length !== 0) ||
    (data.revoked && !data.uncertain) ||
    (data.deleted && (data.uncertain || data.revoked))
  )
    fail('INVALID', 'inconsistent native directory-deletion observation')
  const copy = {
    __proto__: null,
    version: 1 as const,
    device: actual.device,
    inode: actual.inode,
    deleted: data.deleted,
    revoked: data.revoked,
    uncertain: data.uncertain,
    errors: reasons,
  }
  freeze(copy)
  return copy
}

function closure(value: unknown): TestSnapshotDirectoryDeletionClosure {
  const data = fields(value, [
    'version',
    'duplicateClosed',
    'queueClosed',
    'uncertain',
    'errors',
  ])
  const reasons = errors(data.errors)
  if (
    data.version !== 1 ||
    typeof data.duplicateClosed !== 'boolean' ||
    typeof data.queueClosed !== 'boolean' ||
    typeof data.uncertain !== 'boolean' ||
    data.uncertain !== (reasons.length !== 0) ||
    ((!data.duplicateClosed || !data.queueClosed) && !data.uncertain)
  )
    fail('INVALID', 'inconsistent native directory-deletion closure')
  const copy = {
    __proto__: null,
    version: 1 as const,
    duplicateClosed: data.duplicateClosed,
    queueClosed: data.queueClosed,
    uncertain: data.uncertain,
    errors: reasons,
  }
  freeze(copy)
  return copy
}

type NativeMethod = (...args: unknown[]) => unknown

function ownMethod(value: unknown, name: string): NativeMethod | undefined {
  if (!value || (typeof value !== 'object' && typeof value !== 'function'))
    return
  const method = descriptor(value, name)
  return method && hasOwn(method, 'value') && typeof method.value === 'function'
    ? (method.value as NativeMethod)
    : undefined
}

function watchMethod(value: unknown, name: string): NativeMethod | undefined {
  if (!value || (typeof value !== 'object' && typeof value !== 'function'))
    return
  // An invalid own descriptor shadows the prototype; never invoke accessors.
  if (descriptor(value, name)) return ownMethod(value, name)
  const parent = prototype(value)
  if (!parent || parent === objectPrototype || parent === functionPrototype)
    return
  return ownMethod(parent, name)
}

function factoryFailure(
  failure: unknown,
  watch: unknown,
  close: NativeMethod | undefined
): never {
  let cleanup: TestSnapshotDirectoryDeletionClosure | undefined
  let cleanupFailure: unknown
  if (close) {
    try {
      cleanup = closure(apply(close, watch, []))
    } catch (error) {
      cleanupFailure = error
    }
  }
  const certain =
    cleanup &&
    cleanup.duplicateClosed &&
    cleanup.queueClosed &&
    !cleanup.uncertain
  throw new Error(
    `ERR_NEXT_TEST_SNAPSHOT_DELETION_INVALID: post-factory validation failed; ${
      certain ? 'captured native close completed' : 'native cleanup uncertain'
    }`,
    {
      cause: {
        failure,
        cleanup,
        cleanupFailure,
        closeCaptured: Boolean(close),
      },
    }
  )
}

/** Capture originals without querying capability during ordinary binding load. */
export function bindTestSnapshotDirectoryDeletionMethods(
  binding: unknown
): TestSnapshotDirectoryDeletionMethods {
  const capability = ownMethod(
    binding,
    'testSnapshotDirectoryDeletionCapability'
  )
  const factory = ownMethod(binding, 'testSnapshotWatchDirectoryDeletion')
  function readCapability(): TestSnapshotDirectoryDeletionCapability {
    let supported = false
    if (capability && factory) {
      const data = fields(apply(capability, binding, []), [
        'version',
        'platformSupported',
      ])
      if (data.version !== 1 || typeof data.platformSupported !== 'boolean')
        fail('INVALID', 'invalid native directory-deletion capability')
      supported = data.platformSupported
    }
    const copy = {
      __proto__: null,
      version: 1 as const,
      platformSupported: supported,
    }
    freeze(copy)
    return copy
  }
  const methods = {
    __proto__: null,
    testSnapshotDirectoryDeletionCapability: readCapability,
    testSnapshotWatchDirectoryDeletion(
      heldStageFd: number,
      expectedIdentity: TestSnapshotDirectoryDeletionIdentity
    ): TestSnapshotDirectoryDeletionWatch {
      if (
        !Number.isInteger(heldStageFd) ||
        heldStageFd < 0 ||
        heldStageFd > 2147483647
      )
        fail('INVALID', 'held directory fd must be an integral nonnegative i32')
      const expected = identity(expectedIdentity)
      if (!readCapability().platformSupported)
        fail(
          'UNSUPPORTED',
          'native directory-deletion observation is unavailable'
        )
      const watch = apply(factory!, binding, [heldStageFd, expected])
      let close: NativeMethod | undefined
      try {
        close = watchMethod(watch, 'close')
        const poll = watchMethod(watch, 'poll')
        if (
          !watch ||
          typeof watch !== 'object' ||
          isPromise(watch) ||
          !close ||
          !poll
        )
          fail(
            'INVALID',
            'native watch must have original data poll/close methods'
          )
        const copy = {
          __proto__: null,
          poll() {
            return observation(apply(poll, watch, []), expected)
          },
          close() {
            return closure(apply(close!, watch, []))
          },
        }
        freeze(copy)
        return copy
      } catch (error) {
        factoryFailure(error, watch, close)
      }
    },
  }
  freeze(methods)
  return methods
}
