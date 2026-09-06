// NOT IMPLEMENTED YET — this fixture is expected to fail.
//
// Turbopack currently backs off completely when a namespace object of a module escapes: the module
// keeps its original export keys. Webpack does better — it keeps mangling the internal keys and
// *materializes* a namespace object that maps the original names onto them, so one `import * as ns`
// in a dependency no longer un-mangles the whole module.
//
// See webpack's `test/configCases/mangle/mangle-escaping-namespace`, which asserts both halves:
// the raw export is not defined under its original name, and the materialized namespace object
// exposes the original name.
//
// What blocks it today is *export usage*, not module structure. When the namespace object genuinely
// escapes (`export const getEnums = () => ns`), the analysis cannot enumerate the reads, so the
// module's usage widens to `ModuleExportUsageInfo::All` and mangling backs off on that. Forcing the
// facade / locals split for mangled modules does not help: the widened usage propagates through the
// facade to the locals module, so both keep their original keys. Materialization needs the facade to
// pin the original names *while* declaring a known, named usage of the locals module.
//
// Lives under `__skipped__`, so the harness asserts it still fails. When materialization is
// implemented this fixture starts passing, the suite goes red, and it should be moved out of
// `__skipped__`.

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

  // ...while the module's own export keys are still shortened. This is the part that isn't
  // implemented: today `canMangle` is false here because we back off instead.
  expect(ns.exportsInfo.ENUM_A.canMangle).toBe(true)
  expect(ns.exportsInfo.ENUM_A.mangledName).not.toBe('ENUM_A')
  expect(ns.exportsInfo.ENUM_B.mangledName).not.toBe(
    ns.exportsInfo.ENUM_A.mangledName
  )
})
