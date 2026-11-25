import { getCat } from 'lib'
import { moduleCode } from '../../../__helpers__/module-factories.js'

it('imports a function from a side-effect-free module', () => {
  expect(`I like ${getCat()}`).toBe('I like cat')
})

it('only exports the used function', () => {
  const code = moduleCode('node_modules/lib/index.js')
  const registration = code.match(/\.s\(\[([\s\S]*?)\]\)/)[1]
  expect(registration).toMatch(/\bgetCat\b/)
  // Built dynamically so this test file itself doesn't contain the names.
  expect(registration).not.toContain(['get', 'Dog'].join(''))
  expect(registration).not.toContain(['get', 'Chimera'].join(''))
})
