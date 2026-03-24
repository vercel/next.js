import { Data } from './data'

it('should re-export own namespace correctly', () => {
  expect(Data.foo()).toBe('foo')
  expect(Data.bar()).toBe('bar')
})
