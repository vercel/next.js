it('does not classify shadowed module and require bindings as forwarding', () => {
  expect(require('./shadowed').value).toBe('shadowed')
})

it('preserves a require member assigned to module.exports', () => {
  expect(require('./member').value).toBe('inner')
})

it('preserves non-simple module.exports assignments', () => {
  expect(require('./compound').value).toBe('value')
})
