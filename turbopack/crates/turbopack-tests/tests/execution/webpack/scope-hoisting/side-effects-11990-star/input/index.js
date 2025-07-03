import { value, value3 } from './reexport'

it('should generate working code', () => {
  expect(value).toBe(42)
  expect(value3).toBe(42)
})

it('should run the chunk1', () => import('./chunk1'))
it('should run the chunk2', () => import('./chunk2'))
