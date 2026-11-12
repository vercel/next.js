import { test } from 'vitest'
test('original nested error', () => {
  throw new Error('outer original cause', {
    cause: new Error('inner original cause'),
  })
})
