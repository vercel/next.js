import Link from 'next/link'
import { Marker } from '../marker'

export default function Other() {
  return (
    <main>
      <Marker name="other" />
      <Link href="/" id="to-home">
        to home
      </Link>
    </main>
  )
}
