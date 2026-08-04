'use client'

import { loadDeadImport, loadLiveImport } from './imports'

export default function Page() {
  return (
    <main>
      <button onClick={loadDeadImport}>Load dead import</button>
      <button onClick={loadLiveImport}>Load live import</button>
    </main>
  )
}
