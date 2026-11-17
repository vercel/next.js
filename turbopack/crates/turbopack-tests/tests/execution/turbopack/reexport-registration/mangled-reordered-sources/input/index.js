import { order } from './order'
import { a, y, z } from './reexports'

it('reads mangled re-exports from several sources in import order', () => {
  expect(a).toBe('a-value')
  expect(y).toBe('y-value')
  expect(z).toBe('z-value')
  expect(order).toEqual(['first', 'second'])
})
