import Link from 'next/link'
import { sharedModuleMarker } from '../lib/shared'

export default function Page() {
  return (
    <>
      <p id="marker">{sharedModuleMarker()}</p>
      <Link href="/other" id="to-other">
        other
      </Link>
    </>
  )
}
