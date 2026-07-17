import Link from 'next/link'
import { Counter } from '../counter'

export default function Other() {
  return (
    <main>
      <h1 id="other-heading">Other page</h1>
      <p id="other-text">server rendered text on other</p>
      <Counter label="other" />
      <Link href="/" id="to-home">
        Back home
      </Link>
    </main>
  )
}
