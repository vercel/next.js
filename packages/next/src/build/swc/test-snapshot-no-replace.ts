/** Filesystem publication only; this never supplies native compiler provenance. */
export interface TestSnapshotIdentity {
  device: string
  inode: string
}
export interface TestSnapshotNoReplaceCapability {
  version: 1
  platformSupported: boolean
}
export interface TestSnapshotNoReplaceMethods {
  testSnapshotNoReplaceCapability(): TestSnapshotNoReplaceCapability
  testSnapshotPublishNoReplace(
    stagingPath: string,
    publicationPath: string,
    expectedIdentity: TestSnapshotIdentity
  ): TestSnapshotIdentity
}
function fail(kind: string, reason: string): never {
  throw new Error(`ERR_NEXT_TEST_SNAPSHOT_NOREPLACE_${kind}: ${reason}`)
}
function fields(value: unknown, keys: readonly string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return (
        !descriptor ||
        !Object.hasOwn(descriptor, 'value') ||
        !descriptor.enumerable
      )
    }) ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== 'string' || !keys.includes(key)
    )
  )
    fail('INVALID', 'invalid filesystem result shape')
  return value as Record<string, unknown>
}
function identity(value: unknown): TestSnapshotIdentity {
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
  return Object.freeze({
    device: data.device as string,
    inode: data.inode as string,
  })
}
function method(binding: unknown, name: string) {
  if (
    !binding ||
    (typeof binding !== 'object' && typeof binding !== 'function')
  )
    return
  const descriptor = Object.getOwnPropertyDescriptor(binding, name)
  return descriptor &&
    Object.hasOwn(descriptor, 'value') &&
    typeof descriptor.value === 'function'
    ? (descriptor.value as (...args: unknown[]) => unknown)
    : undefined
}
/** Capture originals without calling a new method during ordinary binding load. */
export function bindTestSnapshotNoReplaceMethods(
  binding: unknown
): TestSnapshotNoReplaceMethods {
  const capability = method(binding, 'testSnapshotNoReplaceCapability')
  const publish = method(binding, 'testSnapshotPublishNoReplace')
  function readCapability(): TestSnapshotNoReplaceCapability {
    if (!capability || !publish)
      fail(
        'UNSUPPORTED',
        'native filesystem publication methods are unavailable'
      )
    const result = fields(Reflect.apply(capability, binding, []), [
      'version',
      'platformSupported',
    ])
    if (result.version !== 1 || typeof result.platformSupported !== 'boolean')
      fail('INVALID', 'invalid native filesystem capability')
    return Object.freeze({
      version: 1,
      platformSupported: result.platformSupported,
    })
  }
  return {
    testSnapshotNoReplaceCapability: readCapability,
    testSnapshotPublishNoReplace(
      stagingPath,
      publicationPath,
      expectedIdentity
    ) {
      if (!readCapability().platformSupported)
        fail(
          'UNSUPPORTED',
          'native atomic no-replace publication is unavailable on this platform'
        )
      if (
        typeof stagingPath !== 'string' ||
        typeof publicationPath !== 'string'
      )
        fail('INVALID', 'snapshot paths must be strings')
      const expected = identity(expectedIdentity)
      const result = identity(
        Reflect.apply(publish!, binding, [
          stagingPath,
          publicationPath,
          expected,
        ])
      )
      if (result.device !== expected.device || result.inode !== expected.inode)
        fail(
          'IDENTITY',
          'native publication returned another directory identity'
        )
      return result
    },
  }
}
