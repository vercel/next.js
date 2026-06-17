import Link from 'next/link'
import Navigation from './Navigation'

export default function Page() {
  return (
    <div>
      <h1>Home</h1>

      <nav>
        <Link href="/about">About Us</Link>
        <Link href="/contact">Contact</Link>
      </nav>

      <main>
        <p>Welcome to our website!</p>
        <Navigation />
      </main>
    </div>
  )
}
