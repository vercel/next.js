import * as locals from './locals'
import * as withStar from './with-star'

it('lists local exports in code unit order', () => {
  expect(Object.keys(locals)).toEqual([
    'a',
    'b',
    'default',
    'mutable',
    '😀',
    '｡',
  ])
  expect(locals.a).toBe('a-value')
  expect(locals.b()).toBe('b-value')
  expect(locals.default).toBe('default-value')
  expect(locals.mutable).toBe('mutable-value')
  expect(locals['😀']).toBe('grinning-value')
  expect(locals['｡']).toBe('halfwidth-stop-value')
})

it('lists local and star re-exported names in code unit order', () => {
  expect(Object.keys(withStar)).toEqual(['c', 'y', 'z', '😀', '｡'])
  expect(withStar.c).toBe('c-value')
  expect(withStar.y).toBe('y-value')
  expect(withStar.z).toBe('z-value')
  expect(withStar['😀']).toBe('grinning-value')
  expect(withStar['｡']).toBe('halfwidth-stop-value')
})
