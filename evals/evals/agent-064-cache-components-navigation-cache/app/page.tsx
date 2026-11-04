import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Products</h1>
      <ul>
        <li>
          <Link href="/products/1">View espresso machine</Link>
        </li>
        <li>
          <Link href="/products/2">View coffee grinder</Link>
        </li>
      </ul>
    </main>
  )
}
