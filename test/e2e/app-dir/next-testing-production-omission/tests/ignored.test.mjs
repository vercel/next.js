import './ignored-private-data.mjs'
import { test, vi } from 'vitest'
vi.mock('never-required-test-only-package', () => ({
  value: 'NEXT_OMISSION_TEST_ONLY_SENTINEL',
}))
test('unused ordinary app test', () => {
  throw new Error('NEXT_OMISSION_TEST_ONLY_SENTINEL')
})
