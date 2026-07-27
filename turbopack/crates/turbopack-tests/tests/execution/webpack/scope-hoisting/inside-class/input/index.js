import { Foo, Bar as FirstBar } from './first'
import { Foo as SecondFoo, Bar } from './second'

it('should renamed class reference in inner scope', function () {
  var a = new Foo().test()
  var b = new SecondFoo().test()
  expect(a).toBe(1)
  expect(b).toBe(2)
  expect(new FirstBar().test()).toBe(1)
  expect(new Bar().test()).toBe(2)
})
