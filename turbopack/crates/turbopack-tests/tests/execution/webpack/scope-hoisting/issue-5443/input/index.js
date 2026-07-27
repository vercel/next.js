import { module } from './reexport'

it('should have the correct values', function () {
  expect(module).toEqual(
    nsObj({
      default: 'default',
      named: 'named',
    })
  )
})
