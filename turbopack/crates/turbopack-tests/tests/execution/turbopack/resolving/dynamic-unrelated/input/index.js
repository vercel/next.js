function requireSub(s) {
  return require(`./sub/${s}`)
}

it('should ignore unrelated files for dynamic requests', () => {
  expect(requireSub('index').default).toBe('sub')
})
