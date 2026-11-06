import { ASYNC_IMPORT_LABEL } from './async-import-shared'

// The nested async import shares a module with this next/dynamic target, so its chunks depend on
// the availability the target's chunk group is created with.
export default function AsyncImportTarget() {
  return (
    <button id="async-import-target" onClick={() => import('./async-import')}>
      {ASYNC_IMPORT_LABEL}
    </button>
  )
}
