import { test, expect } from 'vitest'
test('separate file preserves ordinary representation', () =>
  expect({ releaseValue: 1 }).toMatchSnapshot())
