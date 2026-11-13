import { derived } from './lib.js'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('reads an export derived from another export via top-level `this`', () => {
  expect(derived).toBe('base-value!')
})

it('keeps an export read through top-level `this`', () => {
  expect(moduleCode('lib.js')).toContain(".base = 'base-value'")
})
