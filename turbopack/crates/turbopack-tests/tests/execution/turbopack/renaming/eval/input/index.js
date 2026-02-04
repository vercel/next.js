module // <- This is important!

it('should not rename variables when eval is used', () => {
  const modules = {
    x: (module) => {
      'use strict'
      return eval('module')
    },
  }
  const moduleArrowFunction = (module) => {
    'use strict'
    return eval('module')
  }
  function moduleFunciton(module) {
    'use strict'
    return eval('module')
  }
  expect(modules.x(42)).toBe(42)
  expect(moduleArrowFunction(42)).toBe(42)
  expect(moduleFunciton(42)).toBe(42)
})
