function requireRoot(s) {
  return require(`pkg/${s}`)
}
function requireExact(s) {
  return require(`pkg/exact-${s}`)
}
function requireWildcardSuffix(s) {
  return require(`pkg/wildcard-suffix-${s}`)
}
function requireWildcard(s) {
  return require(`pkg/wildcard-${s}`)
}
function requireExactAConstantSuffix(s) {
  return require(`pkg/${s}exact-a`)
}

it('should correctly handle dynamic requests into exports field (exact)', () => {
  // TODO it currently only returns a single entry
  // expect(requireExact('a').default).toBe('a')
  // expect(requireExact('b').default).toBe('b')
  expect(requireExact('c').default).toBe('c')
})

it('should correctly handle dynamic requests into exports field (wildcard with suffix)', () => {
  expect(requireWildcardSuffix('a').default).toBe('a')
  expect(requireWildcardSuffix('b').default).toBe('b')
  expect(requireWildcardSuffix('c').default).toBe('c')
})

it('should correctly handle dynamic requests into exports field (wildcard)', () => {
  expect(requireWildcard('a').default).toBe('a')
  expect(requireWildcard('b').default).toBe('b')
  expect(requireWildcard('c').default).toBe('c')
})

it('should correctly handle dynamic requests into exports field (empty dynamic prefix)', () => {
  // TODO it currently only returns a single entry
  // expect(requireExactAConstantSuffix('').default).toBe('a')

  expect(requireExactAConstantSuffix('sub/').default).toBe('a')
})

it('should correctly handle dynamic requests into exports field (mixed)', () => {
  // TODO it currently only returns a single entry
  // expect(requireRoot('exact-a').default).toBe('a')
  expect(requireRoot('sub/exact-a').default).toBe('a')
  // expect(requireRoot('exact-b').default).toBe('b')
  // // expect(requireRoot('exact-c').default).toBe('c')

  // expect(requireRoot('wildcard-suffix-a').default).toBe('a')
  // expect(requireRoot('wildcard-suffix-b').default).toBe('b')
  // expect(requireRoot('wildcard-suffix-c').default).toBe('c')
  // expect(requireRoot('wildcard-a').default).toBe('a')
  // expect(requireRoot('wildcard-b').default).toBe('b')
  // expect(requireRoot('wildcard-c').default).toBe('c')
})
