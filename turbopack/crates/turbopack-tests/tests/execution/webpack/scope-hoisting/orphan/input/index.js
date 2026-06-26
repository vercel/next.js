import x from 'pkg'

it('should compile fine', () => {
  const result = x
  expect(result.value).toBe(42)
})
