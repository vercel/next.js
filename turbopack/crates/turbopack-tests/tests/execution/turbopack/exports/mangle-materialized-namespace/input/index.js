// A module whose namespace object escapes is still mangled, the way webpack does it: the internal
// export keys are shortened, and the namespace object handed to user code is *materialized* by the
// facade, mapping the original names onto those keys. One `import * as ns` in a dependency no
// longer un-mangles the whole module.
//
// Compare webpack's `test/configCases/mangle/mangle-escaping-namespace`, which asserts both halves:
// the raw export is not defined under its original name, and the materialized namespace object
// exposes the original name.

import { getEnums } from './provider'

it('should still mangle a module whose namespace escapes', () => {
  const ns = getEnums()
  // The namespace object keeps the original names...
  expect(ns.ENUM_A).toBe('a-value')
  expect(ns.ENUM_B).toBe('b-value')
  expect(ns.default).toBe('default-value')
  expect(Object.keys(ns).sort()).toEqual([
    'ENUM_A',
    'ENUM_B',
    'default',
    'exportsInfo',
  ])

  // ...while the module's own export keys are shortened underneath.
  expect(ns.exportsInfo.ENUM_A.canMangle).toBe(true)
  expect(ns.exportsInfo.ENUM_A.mangledName).not.toBe('ENUM_A')
  expect(ns.exportsInfo.ENUM_B.mangledName).not.toBe(
    ns.exportsInfo.ENUM_A.mangledName
  )
})
