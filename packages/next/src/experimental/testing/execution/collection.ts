import type { CompiledTestArtifact, TestFileCollection } from '../contracts'

/** Reject malformed or cross-file facts before authoritative process closure. */
export function assertTestFileCollection(
  value: unknown,
  artifact: Pick<CompiledTestArtifact, 'entryId' | 'revision'>
): asserts value is TestFileCollection {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid test collection facts.')
  const collection = value as TestFileCollection
  if (
    collection.version !== 1 ||
    collection.entryId !== artifact.entryId ||
    collection.revision !== artifact.revision ||
    Object.keys(collection).some(
      (key) => !['version', 'entryId', 'revision', 'cases'].includes(key)
    ) ||
    !Array.isArray(collection.cases) ||
    collection.cases.length > 100000
  )
    throw new Error('Invalid test collection identity or shape.')
  const ids = new Set<string>()
  let bytes = 0
  for (const test of collection.cases) {
    if (
      !test ||
      typeof test !== 'object' ||
      Object.keys(test).some((key) => key !== 'id' && key !== 'name') ||
      typeof test.id !== 'string' ||
      !test.id.startsWith(`${artifact.entryId}/`) ||
      ids.has(test.id) ||
      typeof test.name !== 'string'
    )
      throw new Error('Invalid or duplicate collected test identity.')
    ids.add(test.id)
    bytes += Buffer.byteLength(test.id) + Buffer.byteLength(test.name)
    if (bytes > 16 * 1024 * 1024)
      throw new Error('Test collection facts exceeded the size limit.')
  }
}

/** Validate isolated facts against requested files and observed compiler revisions. */
export function assertTestFileCollections(
  value: unknown,
  selected: ReadonlySet<string>,
  startedRevisions: ReadonlyMap<string, string>,
  complete = false
): asserts value is TestFileCollection[] {
  if (
    !Array.isArray(value) ||
    value.length > selected.size ||
    (complete && value.length !== selected.size)
  )
    throw new Error('Invalid isolated test collections.')
  const completed = new Set<string>()
  for (const collection of value) {
    if (
      !collection ||
      typeof collection !== 'object' ||
      typeof collection.entryId !== 'string' ||
      !selected.has(collection.entryId) ||
      completed.has(collection.entryId)
    )
      throw new Error('Unrequested or duplicate isolated test collection.')
    const revision = startedRevisions.get(collection.entryId)
    if (revision === undefined)
      throw new Error(
        'Test collection has no authoritative file-start revision.'
      )
    assertTestFileCollection(collection, {
      entryId: collection.entryId,
      revision,
    })
    completed.add(collection.entryId)
  }
}
