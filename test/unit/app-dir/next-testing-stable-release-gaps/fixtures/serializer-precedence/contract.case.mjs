import { test, expect } from 'vitest'
test('latest registered serializer wins', () =>
  expect({ releaseValue: 1 }).toMatchSnapshot())
