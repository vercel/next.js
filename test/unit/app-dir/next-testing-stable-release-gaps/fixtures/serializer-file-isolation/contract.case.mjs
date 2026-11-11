import { test, expect } from 'vitest'
expect.addSnapshotSerializer({
  test: (value) => value?.releaseValue === 1,
  serialize: () => 'FILE_OWNED_SERIALIZER',
})
test('registered file', () => expect({ releaseValue: 1 }).toMatchSnapshot())
