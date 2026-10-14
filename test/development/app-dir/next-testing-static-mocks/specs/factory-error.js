import { test, vi } from 'vitest'
import { observed } from '../subject'
vi.mock('../dependency', () => {
  throw new Error('intentional factory failure')
})
test('must not collect after factory failure', () => {
  void observed
})
