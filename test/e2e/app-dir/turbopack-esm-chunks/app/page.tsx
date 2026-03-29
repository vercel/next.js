import dynamic from 'next/dynamic'
import { Counter } from './components/counter'
import Link from 'next/link'

const Lazy = dynamic(() => import('./components/lazy'), {
  loading: () => <p id="lazy-loading">Loading lazy...</p>,
})

export default function Home() {
  return (
    <div>
      <h1 id="home-title">Home</h1>
      <Counter />
      <Lazy />
      <Link href="/other" id="to-other">
        Go to other
      </Link>
    </div>
  )
}
