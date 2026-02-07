import { CreateUserAction, AlternativeCreateUserAction } from './Actions.js'

it('should handle top level await', async () => {
  const res = await CreateUserAction('John')
  expect(res).toBe('fake data')
})

it('should handle top level await (alternative)', async () => {
  const res = await AlternativeCreateUserAction('John')
  expect(res).toBe('fake data')
})
