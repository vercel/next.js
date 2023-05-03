import { named } from './module.js'

function Fun({ value = named }) {
  return value
}

it('support imports in default arguments', () => {
  expect(Fun({})).toBe('named')
})
