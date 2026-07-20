import greeting from '#/greeting.js'

it('should resolve #/* subpath imports', () => {
  expect(greeting).toBe('hello')
})
