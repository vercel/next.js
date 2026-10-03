import Link from 'next/link'
import { Marker } from './marker'

// One id below the layout's `top`.
export default function Page() {
  return (
    <main>
      <Marker name="home" />
      <Link href="/other" id="to-other">
        to other
      </Link>
    </main>
  )
}
