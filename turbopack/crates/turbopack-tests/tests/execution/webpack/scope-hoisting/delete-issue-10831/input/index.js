import { object } from './module'

it('should allow to delete a imported property', () => {
  expect(object).toEqual({ property: true })
  delete object.property
  expect(object).toEqual({})
})
