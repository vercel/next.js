import Link from 'next/link'
import { useEffect, useState } from 'react'
import { sharedModuleMarker } from '../lib/shared'

export default function Page() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  return (
    <>
      <p id="marker">{sharedModuleMarker()}</p>
      <p id="hydrated">{hydrated ? 'hydrated' : 'not hydrated'}</p>
      <Link href="/other" id="to-other">
        other
      </Link>
    </>
  )
}
