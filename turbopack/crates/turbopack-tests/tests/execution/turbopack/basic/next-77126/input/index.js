import run from './module'

it('should handle undefined variables', () => {
  expect(run()).toEqual('should run')
})
