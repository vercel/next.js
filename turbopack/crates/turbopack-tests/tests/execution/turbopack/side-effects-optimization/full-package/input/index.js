import { c as c5 } from 'package-full'
it('should allow to import the whole module and pick without duplicating the module', () => {
  expect(c5).toEqual({ c: 1 })
  const fullModule = require('package-full')
  expect(fullModule.a).toEqual('a')
  expect(fullModule.b).toEqual('b')
  expect(fullModule.c).toEqual({ c: 1 })
  expect(fullModule.d).toEqual('x')
  expect(fullModule.local).toEqual('local')
  expect(fullModule.default).toEqual('local-default')
  expect(fullModule.def).toEqual('default')

  // Check for identity
  expect(fullModule.c).toBe(c5)
})
