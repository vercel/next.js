import { config, usedArrow, usedObject } from './a.js'

it('removes unused pure initializers without leaving references to removed imports', () => {
  expect(globalThis.unusedConstDependencyBundled).toBeUndefined()
})

it('keeps dependencies of used constant initializers', () => {
  expect(globalThis.usedConstDependencyBundled).toBe(true)
  expect(usedArrow()).toBe('used')
  expect(usedObject.callback()).toBe('used')
})

it('preserves module-local mutations whose result is unused', () => {
  expect(config.value).toBe('kept')
})

it('keeps effectful loop initializers even when their condition is false', () => {
  expect(globalThis.loopInitializerDependencyBundled).toBe(true)
})

it('preserves initializer, argument, destructuring, spread, and iteration effects', () => {
  expect(globalThis.constInitializerEffects).toEqual([
    'initializer',
    'argument',
    'destructuring',
    'spread',
    'mixed declaration',
    'require',
    'iteration',
    'iteration',
    'loop',
  ])
})
