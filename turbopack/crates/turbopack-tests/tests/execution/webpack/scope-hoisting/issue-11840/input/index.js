import { Mixin } from './Mixin'

const createMixin = (fn) => class Mixin extends fn(Mixin) {}

it('should have no name conflict', () => {
  expect(new (createMixin((x) => x))()).toBeInstanceOf(Mixin)
})
