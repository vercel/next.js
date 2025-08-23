function requirePkg(s) {
  return require(`pkg-${s}`)
}
function requireOrgPkg(s) {
  return require(`@org/pkg-${s}`)
}

it('should correctly handle dynamic parts in regular package name', () => {
  expect(requirePkg('a').default).toBe('pkg-a')
  expect(requirePkg('b').default).toBe('pkg-b')
  expect(requirePkg('c').default).toBe('pkg-c')
})
it('should correctly handle dynamic parts in namespaced package name', () => {
  expect(requireOrgPkg('a').default).toBe('org/pkg-a')
  expect(requireOrgPkg('b').default).toBe('org/pkg-b')
  expect(requireOrgPkg('c').default).toBe('org/pkg-c')
})
