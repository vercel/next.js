import def from './cjs'

it('gives an ESM default import the whole module.exports', () => {
  expect(typeof def).toBe('object')
  expect(def.default).toBe('the-default')
  expect(def.named).toBe('the-named')
})
