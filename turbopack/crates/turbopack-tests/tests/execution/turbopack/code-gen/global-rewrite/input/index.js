console.log(global)
let globalThis = 2

it('should rewrite global', () => {
  expect(typeof global).toBe('object')
  expect(typeof globalThis).toBe('number')
})
