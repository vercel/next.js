import { hello } from 'package-with-optional-deps'

it('should ignore missing optional peer dependencies', () => {
  expect(hello()).toBe('world')
})
