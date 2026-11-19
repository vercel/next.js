import { usedComposedClassName } from './style.module.css'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('supports named imports without mangling', () => {
  expect(usedComposedClassName.split(' ')).toEqual([
    expect.stringMatching(/_usedComposedClassName$/),
    expect.stringMatching(/_usedBaseClassName$/),
  ])
})

it('emits used exports under their original keys and omits unused ones', () => {
  const code = moduleCode('style.module.css')
  expect(code).toContain('"usedComposedClassName"')
  expect(code).not.toContain('"usedBaseClassName"')
  expect(code).not.toContain('unusedClassName')
})
