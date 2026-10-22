import { usedArrow, usedObject } from './a.js'

it('removes unused pure initializers without leaving references to removed imports', () => {
  expect(globalThis.unusedConstDependencyBundled).toBeUndefined()
})

it('keeps dependencies of used constant initializers', () => {
  expect(globalThis.usedConstDependencyBundled).toBe(true)
  expect(usedArrow()).toBe('used')
  expect(usedObject.callback()).toBe('used')
})

it('preserves initializer, argument, destructuring, spread, and iteration effects', () => {
  expect(globalThis.constInitializerEffects).toEqual([
    'initializer',
    'argument',
    'destructuring',
    'spread',
    'mixed declaration',
    'iteration',
    'iteration',
  ])
})
