it('throws when requiring a TypeScript module that failed to parse', () => {
  expect(() => require('./other.ts')).toThrow('Cannot assign to this')
})
