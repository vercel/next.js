import { test } from 'vitest'
import { value } from 'next-testing-external-probe'
test('external package', () => {
  if (value !== 42) throw new Error('incorrect dependency')
})
