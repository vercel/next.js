import Link from 'next/link'
import { Marker } from './marker'
import { Refresh } from './refresh'
import { ActionForm } from './action-form'

export default function Page() {
  return (
    <main>
      <Marker name="home" />
      <Link href="/other" id="to-other">
        to other
      </Link>
      <Refresh />
      <ActionForm />
    </main>
  )
}
