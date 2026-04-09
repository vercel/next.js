import * as ns from './non-enumerable.js'

it('should allow to access non-enumerable inherited properties', () => {
  const test = Object(ns)
  expect(test.named).toEqual('named')
  expect(test.default).toMatchObject({
    named: 'named',
    default: 'default',
    base: 'base',
  })
  expect(test).toMatchObject({
    named: 'named',
    base: 'base',
    default: expect.objectContaining({
      named: 'named',
      default: 'default',
      base: 'base',
    }),
  })
})
