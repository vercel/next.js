// Statically imported by `index.js` and dynamically by `lazy.js`, so it is exposed across a chunk
// boundary and its export object is really emitted even with scope hoisting on.

export const someLongExportName = 'shared-1'
export const anotherLongExportName = 'shared-2'

export function aLongFunctionName() {
  return 'shared-fn'
}
