import moduleUniversal from './module-universal.js'
import moduleReassign from './module-reassign.js'
import exportsReassign from './exports-reassign.js'

it('should use the CommonJS variant of universal module definitions', () => {
  expect(moduleUniversal()).toBe('other-dep 1234')
})

it('should not replace typeof exports for non-free variables', () => {
  expect(exportsReassign).toBe(1234)
})

it('should not replace typeof module for non-free variables', () => {
  expect(moduleReassign.foo).toBe(1234)
})
