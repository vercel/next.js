import Link from 'next/link'
import { Marker } from '../marker'

// Two ids, so `bottom` lands one counter later than it does on `/`.
export default function Other() {
  return (
    <main>
      <Marker name="other-a" />
      <Marker name="other-b" />
      <Link href="/" id="to-home">
        to home
      </Link>
    </main>
  )
}
