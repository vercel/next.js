import { test, expect } from 'vitest'
test('configuration serializer is loaded before snapshots', () =>
  expect({ releaseSpecial: 42 }).toMatchSnapshot())
