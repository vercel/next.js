import Link from 'next/link'
import { sum } from '../lib/subject'

export default function Page() {
  return (
    <main>
      <p id="unit-result">{sum([2, 3, 5])}</p>
      <Link href="/reference" id="reference-link">
        Reference
      </Link>
    </main>
  )
}
