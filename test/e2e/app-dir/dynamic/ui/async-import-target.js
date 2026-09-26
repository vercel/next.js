export default function AsyncImportTarget() {
  return (
    <button id="async-import-target" onClick={() => import('./async-import')}>
      next-dynamic async import target
    </button>
  )
}
