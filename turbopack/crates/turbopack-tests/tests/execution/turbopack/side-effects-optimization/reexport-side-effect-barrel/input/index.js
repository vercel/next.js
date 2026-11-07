import { ObjectElement } from './library'

it('shoudl not discard side-effectful barrel files', () => {
  expect(ObjectElement.foo).toBe('side-effect')
})
