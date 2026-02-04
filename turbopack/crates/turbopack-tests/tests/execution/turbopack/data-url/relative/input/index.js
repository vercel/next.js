import { foo } from "data:text/javascript,export { foo } from './other.js';"

it('support relative imports in data URLs', () => {
  expect(foo).toEqual(1234)
})
