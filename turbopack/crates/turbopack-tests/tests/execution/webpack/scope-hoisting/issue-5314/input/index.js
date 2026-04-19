import a from './module'

var obj = {}

it('should allow access to the default export of the root module', function () {
  expect(a()).toBe(obj)
})

export default obj
