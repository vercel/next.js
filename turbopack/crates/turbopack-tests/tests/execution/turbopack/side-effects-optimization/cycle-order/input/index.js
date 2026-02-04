import { something } from './main'

it('correct order', () => {
  expect(something).toBe('inner')
  expect(globalThis.order).toEqual(['inner throws', 'module', 'main'])
})
