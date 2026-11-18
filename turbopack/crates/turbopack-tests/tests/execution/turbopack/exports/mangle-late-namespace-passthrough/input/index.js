// `barrel.js` is reached twice:
//
// 1. directly from here with named imports (short path), so its `export *` passthrough edge to
//    `source.js` is processed first, without any namespace provenance, and
// 2. through `hop1 -> hop2 -> provider` (long path), where `provider.js` reads the barrel through a
//    partial namespace object. That read uses no names the barrel didn't already use.
//
// The late namespace read must still reach `source.js`, so its exports keep their original names.
//
// `options.json` disables `followReexports`, so the named imports below target the barrel instead
// of being resolved straight to `source.js`, and `mangleViaMaterializedNamespaceObject`, so the
// dynamic import reads the barrel itself rather than a materialized namespace facade.

import { veryLongLateNamespaceExportName, sourceExportsInfo } from './barrel'
import { readLate } from './hop1'

it('should read the value through the direct import and the late namespace read', async () => {
  expect(veryLongLateNamespaceExportName).toBe('late-value')
  expect(await readLate()).toBe('late-value')
})

it('should keep original names of the export-star source', () => {
  expect(sourceExportsInfo.veryLongLateNamespaceExportName.canMangle).toBe(
    false
  )
  expect(sourceExportsInfo.veryLongLateNamespaceExportName.mangledName).toBe(
    null
  )
})
