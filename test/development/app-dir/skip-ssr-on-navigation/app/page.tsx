import Link from 'next/link'
import { Counter } from './counter'

export default function Page() {
  return (
    <main>
      <h1 id="home-heading">Home page</h1>
      <Counter label="home" />
      <Link href="/other" id="to-other">
        Go to other
      </Link>
    </main>
  )
}
