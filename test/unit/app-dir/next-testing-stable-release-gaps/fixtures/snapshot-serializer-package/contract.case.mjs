import { test, expect } from 'vitest'
test('package serializer resolves through the test graph', () =>
  expect({ releaseSpecial: 42 }).toMatchSnapshot())
