import { value } from 'package'

it('should import reexported export correctly', () => {
  expect(value).toBe(42)
})
