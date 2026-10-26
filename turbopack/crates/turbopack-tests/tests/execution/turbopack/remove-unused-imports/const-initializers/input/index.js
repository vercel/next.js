import { config, redeclarationEffects, usedArrow, usedObject } from './a.js'
import functionRedeclarationEffects from './function-redeclarations.cjs'

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

it('preserves effectful var initializers sharing a binding with other var declarations', () => {
  expect(redeclarationEffects).toEqual([
    'nested var initializer',
    'nested var before declaration',
  ])
})

it('preserves effectful var initializers sharing a binding with function declarations', () => {
  expect(functionRedeclarationEffects).toEqual([
    'function then var',
    'var then function',
    'function then nested var',
  ])
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
    'before nested redeclaration',
    'require',
    'iteration',
    'iteration',
    'loop',
  ])
})
