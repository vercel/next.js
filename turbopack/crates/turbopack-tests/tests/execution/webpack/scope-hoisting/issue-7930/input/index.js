import { value } from './module'

it('should export the correct value', () => {
  expect(value).toBe(42)
})

// prevent scope hoisting
if (Math.random() < -1) {
  console.log(module.id)
}
