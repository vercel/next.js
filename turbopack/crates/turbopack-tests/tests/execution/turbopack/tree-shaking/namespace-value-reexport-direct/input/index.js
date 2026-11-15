import { namespace } from './lib'

it('should narrow a member of a direct namespace reexport', () => {
  expect(namespace.value).toBe('value')
  expect(namespace.unusedInfo).toBe(false)
})
